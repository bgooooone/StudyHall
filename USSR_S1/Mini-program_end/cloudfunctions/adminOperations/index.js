const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const seatReleaseLogs = db.collection('seat_release_logs')

exports.main = async (event, context) => {
  const now = new Date()
  console.log('========================================')
  console.log('[adminOps] 🚀 后台管理操作开始执行')
  console.log('[adminOps] 当前时间:', now.toISOString())
  console.log('[adminOps] 操作类型:', event.action)
  console.log('[adminOps] 来源:', event.source || 'unknown')
  console.log('========================================')

  try {
    const { action, seatId, seatIds } = event

    if (!action) {
      return { success: false, error: '缺少 action 参数' }
    }

    if (action === 'forceReleaseSeat') {
      return await forceReleaseOneSeat(seatId, now, event.source)
    }

    if (action === 'batchReleaseSeats') {
      if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
        return { success: false, error: '座位ID列表不能为空' }
      }
      return await batchReleaseSeats(seatIds, now, event.source)
    }

    if (action === 'setMaintenance') {
      if (!seatId) return { success: false, error: '座位ID不能为空' }
      return await setSeatMaintenance(seatId, now, event.source)
    }

    if (action === 'restoreSeat') {
      if (!seatId) return { success: false, error: '座位ID不能为空' }
      return await restoreSeatFromMaintenance(seatId, now, event.source)
    }

    if (action === 'deleteSeat') {
      if (!seatId) return { success: false, error: '座位ID不能为空' }
      return await deleteSeatById(seatId, now, event.source)
    }

    return { success: false, error: `未知操作类型: ${action}` }

  } catch (error) {
    console.error('[adminOps] ❌ 执行出错:', error.message)
    console.error('[adminOps] 堆栈:', error.stack)
    return { success: false, error: error.message }
  }
}

async function forceReleaseOneSeat(seatId, now, source) {
  if (!seatId) {
    return { success: false, error: '座位ID不能为空' }
  }

  console.log(`[adminOps] 🎯 开始强制释放座位: ${seatId}`)

  const seatResult = await db.collection('seats').doc(seatId).get()
  if (!seatResult.data) {
    return { success: false, error: '座位不存在', executedAt: now.toISOString() }
  }

  const seat = seatResult.data
  console.log(`[adminOps] 找到座位: ${seat.seatNumber}, 状态: ${seat.status}`)

  if (seat.status !== '使用中') {
    return { success: true, message: '座位已不在使用中', status: seat.status, executedAt: now.toISOString() }
  }

  let durationSeconds = 0
  const userId = seat.userId || ''

  if (seat.startedAt && userId) {
    const startTime = new Date(seat.startedAt)
    durationSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000)

    if (durationSeconds > 0) {
      try {
        await db.collection('study_records').add({
          data: {
            userId: userId,
            seatId: seat._id,
            seatNumber: seat.seatNumber,
            startTime: startTime,
            endTime: now,
            duration: durationSeconds,
            status: 'completed',
            releasedBy: source || 'admin',
            createdAt: now,
            updatedAt: now
          }
        })

        await db.collection('users').where({ _openid: userId }).update({
          data: { totalStudyTime: db.command.inc(durationSeconds), updatedAt: now }
        })
      } catch (recordErr) {
        console.error('[adminOps] ⚠️ 保存学习记录失败:', recordErr.message)
      }
    }
  }

  if (seat.orderId) {
    try {
      await db.collection('orders').doc(seat.orderId).update({
        data: {
          status: 'completed',
          completedAt: now,
          autoReleased: true,
          releasedBy: source || 'admin',
          updatedAt: now
        }
      })
    } catch (orderErr) {
      console.error('[adminOps] ⚠️ 更新订单状态失败:', orderErr.message)
    }
  }

  await db.collection('seats').doc(seatId).update({
    data: {
      status: '空闲',
      userId: '',
      openid: '',
      reservedAt: null,
      startedAt: null,
      expireAt: null,
      remainingTime: 0,
      autoReleaseAt: null,
      orderId: '',
      hardwareStatus: { light: false, airConditioner: false, door: false },
      releasedBy: source || 'admin',
      releasedAt: now,
      updatedAt: now
    }
  })

  try {
    await seatReleaseLogs.add({
      data: {
        action: 'admin_force_release',
        seatId: seatId,
        seatNumber: seat.seatNumber,
        userId: userId,
        source: source || 'admin_panel',
        studyDurationSeconds: durationSeconds,
        executedAt: now,
        status: 'success'
      }
    })
  } catch (logErr) { }

  console.log(`[adminOps] ✅✅✅ 座位 ${seat.seatNumber} 强制释放成功! 学习时长: ${durationSeconds}秒`)

  return {
    success: true,
    action: 'force_release',
    seatNumber: seat.seatNumber,
    studyDurationSeconds: durationSeconds,
    message: `座位 ${seat.seatNumber} 已成功释放，学习时长: ${durationSeconds}秒`,
    executedAt: now.toISOString()
  }
}

async function batchReleaseSeats(seatIds, now, source) {
  console.log(`[adminOps] 🎯 批量释放 ${seatIds.length} 个座位`)
  let successCount = 0
  let failCount = 0
  const results = []

  for (const sid of seatIds) {
    try {
      const res = await forceReleaseOneSeat(sid, now, (source || 'admin') + '_batch')
      if (res.success && res.action === 'force_release') {
        successCount++
        results.push({ seatId: sid, success: true, seatNumber: res.seatNumber })
      } else {
        results.push({ seatId: sid, success: true, skipped: true, reason: res.message || res.status })
      }
    } catch (e) {
      failCount++
      results.push({ seatId: sid, success: false, error: e.message })
    }
  }

  return {
    success: true,
    action: 'batch_release',
    totalSeats: seatIds.length,
    releasedCount: successCount,
    failedCount: failCount,
    results: results,
    message: `批量释放完成：成功${successCount}个，失败${failCount}个`,
    executedAt: now.toISOString()
  }
}

async function setSeatMaintenance(seatId, now, source) {
  console.log(`[adminOps] 🔧 开始设置座位维护中: ${seatId}`)

  const seatResult = await db.collection('seats').doc(seatId).get()
  if (!seatResult.data) {
    return { success: false, error: '座位不存在', executedAt: now.toISOString() }
  }

  const seat = seatResult.data
  console.log(`[adminOps] 找到座位: ${seat.seatNumber}, 当前状态: ${seat.status}`)

  if (seat.status === '维护中') {
    return { success: true, message: '座位已处于维护中状态', executedAt: now.toISOString() }
  }

  if (seat.status === '使用中') {
    return { success: false, error: '座位正在使用中，请先释放再设为维护', executedAt: now.toISOString() }
  }

  await db.collection('seats').doc(seatId).update({
    data: {
      status: '维护中',
      userId: '',
      reservedAt: null,
      startedAt: null,
      expireAt: null,
      remainingTime: 0,
      autoReleaseAt: null,
      orderId: '',
      hardwareStatus: { light: false, airConditioner: false, door: false },
      updatedAt: now
    }
  })

  try {
    await seatReleaseLogs.add({
      data: {
        action: 'admin_set_maintenance',
        seatId: seatId,
        seatNumber: seat.seatNumber,
        source: source || 'admin_panel',
        executedAt: now,
        status: 'success'
      }
    })
  } catch (logErr) { }

  console.log(`[adminOps] ✅ 座位 ${seat.seatNumber} 已设为维护中`)

  return {
    success: true,
    action: 'set_maintenance',
    seatNumber: seat.seatNumber,
    message: `座位 ${seat.seatNumber} 已设为维护中`,
    executedAt: now.toISOString()
  }
}

async function restoreSeatFromMaintenance(seatId, now, source) {
  console.log(`[adminOps] 🔧 开始恢复维护中座位: ${seatId}`)

  const seatResult = await db.collection('seats').doc(seatId).get()
  if (!seatResult.data) {
    return { success: false, error: '座位不存在', executedAt: now.toISOString() }
  }

  const seat = seatResult.data
  console.log(`[adminOps] 找到座位: ${seat.seatNumber}, 当前状态: ${seat.status}`)

  if (seat.status !== '维护中') {
    return { success: false, error: '该座位不处于维护中状态，无法恢复', status: seat.status, executedAt: now.toISOString() }
  }

  await db.collection('seats').doc(seatId).update({
    data: {
      status: '空闲',
      userId: '',
      reservedAt: null,
      startedAt: null,
      expireAt: null,
      remainingTime: 0,
      autoReleaseAt: null,
      orderId: '',
      hardwareStatus: { light: false, airConditioner: false, door: false },
      updatedAt: now
    }
  })

  try {
    await seatReleaseLogs.add({
      data: {
        action: 'admin_restore_seat',
        seatId: seatId,
        seatNumber: seat.seatNumber,
        source: source || 'admin_panel',
        executedAt: now,
        status: 'success'
      }
    })
  } catch (logErr) { }

  console.log(`[adminOps] ✅ 座位 ${seat.seatNumber} 已恢复为空闲`)

  return {
    success: true,
    action: 'restore_seat',
    seatNumber: seat.seatNumber,
    message: `座位 ${seat.seatNumber} 已恢复为空闲`,
    executedAt: now.toISOString()
  }
}

async function deleteSeatById(seatId, now, source) {
  console.log(`[adminOps] 🗑️ 开始删除座位: ${seatId}`)

  const seatResult = await db.collection('seats').doc(seatId).get()
  if (!seatResult.data) {
    return { success: false, error: '座位不存在', executedAt: now.toISOString() }
  }

  const seat = seatResult.data
  console.log(`[adminOps] 找到座位: ${seat.seatNumber}, 状态: ${seat.status}`)

  if (seat.status === '使用中') {
    return { success: false, error: '座位正在使用中，请先释放再删除', executedAt: now.toISOString() }
  }

  await db.collection('seats').doc(seatId).remove()

  try {
    await seatReleaseLogs.add({
      data: {
        action: 'admin_delete_seat',
        seatId: seatId,
        seatNumber: seat.seatNumber,
        source: source || 'admin_panel',
        executedAt: now,
        status: 'success'
      }
    })
  } catch (logErr) { }

  console.log(`[adminOps] ✅ 座位 ${seat.seatNumber} 已删除`)

  return {
    success: true,
    action: 'delete_seat',
    seatNumber: seat.seatNumber,
    message: `座位 ${seat.seatNumber} 已删除`,
    executedAt: now.toISOString()
  }
}
