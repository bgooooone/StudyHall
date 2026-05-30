<template>
  <div>
    <div class="stats-grid" style="grid-template-columns: repeat(5, 1fr)">
      <div class="stat-card stat-total">
        <div class="stat-icon">🪑</div>
        <div class="stat-body">
          <h3>总座位数</h3>
          <div class="number">{{ seatStats.total }}</div>
        </div>
      </div>
      <div class="stat-card stat-free">
        <div class="stat-icon">✅</div>
        <div class="stat-body">
          <h3>空闲</h3>
          <div class="number">{{ seatStats.free }}</div>
        </div>
      </div>
      <div class="stat-card stat-inuse">
        <div class="stat-icon">🔥</div>
        <div class="stat-body">
          <h3>使用中</h3>
          <div class="number">{{ seatStats.inUse }}</div>
        </div>
      </div>
      <div class="stat-card stat-maintenance">
        <div class="stat-icon">🔧</div>
        <div class="stat-body">
          <h3>维护中</h3>
          <div class="number">{{ seatStats.maintenance }}</div>
        </div>
      </div>
      <div class="stat-card stat-rate">
        <div class="stat-icon">📊</div>
        <div class="stat-body">
          <h3>使用率</h3>
          <div class="number">{{ seatStats.rate }}%</div>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <input
          v-model="searchText"
          type="text"
          class="search-box"
          placeholder="搜索座位号..."
          @input="filterSeats"
        />
        <select
          v-model="statusFilter"
          class="filter-select"
          @change="filterSeats"
        >
          <option value="">全部状态</option>
          <option value="空闲">空闲</option>
          <option value="使用中">使用中</option>
          <option value="维护中">维护中</option>
        </select>
        <button class="btn btn-primary" @click="loadSeats">刷新数据</button>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-success" @click="openAddModal">
          + 添加座位
        </button>
        <button class="btn btn-danger" @click="batchRelease">批量释放</button>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th style="width: 40px">
              <input
                type="checkbox"
                @change="toggleSelectAll"
                :checked="isAllSelected"
              />
            </th>
            <th>座位号</th>
            <th>状态</th>
            <th>用户ID</th>
            <th>订单ID</th>
            <th>开始时间</th>
            <th>到期时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="seat in paginatedSeats" :key="seat._id">
            <td class="checkbox-cell">
              <input
                type="checkbox"
                :value="seat._id"
                v-model="selectedSeatIds"
                :disabled="seat.status !== '使用中'"
              />
            </td>
            <td>
              <strong>{{ seat.seatNumber || "-" }}</strong>
            </td>
            <td>
              <span :class="['status-badge', getStatusClass(seat.status)]">
                {{ getStatusLabel(seat.status) }}
              </span>
            </td>
            <td>
              {{ seat.userId ? seat.userId.substring(0, 14) + "..." : "-" }}
            </td>
            <td>
              {{ seat.orderId ? seat.orderId.substring(0, 12) + "..." : "-" }}
            </td>
            <td>{{ formatDate(seat.startedAt) }}</td>
            <td>{{ formatDate(seat.expireAt) }}</td>
            <td>
              <div class="action-btns">
                <template v-if="seat.status === '使用中'">
                  <button class="btn btn-danger btn-sm" @click="forceRelease(seat)">
                    强制释放
                  </button>
                </template>
                <template v-else-if="seat.status === '维护中'">
                  <button class="btn btn-success btn-sm" @click="restoreSeat(seat)">
                    恢复空闲
                  </button>
                  <button class="btn btn-danger btn-sm" @click="deleteSeat(seat)">
                    删除
                  </button>
                </template>
                <template v-else>
                  <button class="btn btn-warning btn-sm" @click="setMaintenance(seat)">
                    设为维护
                  </button>
                  <button class="btn btn-ghost btn-sm" @click="openEditModal(seat)">
                    编辑
                  </button>
                  <button class="btn btn-danger btn-sm" @click="deleteSeat(seat)">
                    删除
                  </button>
                </template>
              </div>
            </td>
          </tr>
          <tr v-if="filteredSeats.length === 0">
            <td colspan="8" class="empty-state">
              <div class="icon">🪑</div>
              暂无座位数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination" v-if="totalPages > 1">
      <button
        class="page-btn"
        :disabled="currentPage <= 1"
        @click="currentPage--"
      >
        上一页
      </button>
      <button
        v-for="page in visiblePages"
        :key="page"
        :class="['page-btn', { active: page === currentPage }]"
        @click="currentPage = page"
      >
        {{ page }}
      </button>
      <button
        class="page-btn"
        :disabled="currentPage >= totalPages"
        @click="currentPage++"
      >
        下一页
      </button>
      <span style="margin-left: 10px; color: #888; font-size: 13px">
        共 {{ filteredSeats.length }} 条 / 第 {{ currentPage }}/{{ totalPages }}
        页
      </span>
    </div>

    <Modal
      v-if="showModal"
      :title="modalTitle"
      @close="closeModal"
      @confirm="saveSeat"
    >
      <div class="form-group">
        <label>座位号 *</label>
        <input
          v-model="formData.seatNumber"
          type="text"
          placeholder="例：A01, B02, 001"
        />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>区域</label>
          <input
            v-model="formData.area"
            type="text"
            placeholder="例：安静区、讨论区"
          />
        </div>
        <div class="form-group">
          <label>座位类型</label>
          <select
            v-model="formData.seatType"
            class="filter-select"
            style="width: 100%"
          >
            <option value="normal">普通座</option>
            <option value="vip">VIP座</option>
            <option value="window">窗边座</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>备注</label>
        <input
          v-model="formData.remark"
          type="text"
          placeholder="可选备注信息"
        />
      </div>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, inject } from "vue";
import {
  getDB,
  callCloudFunction,
  ensureCloudReady,
  formatDate as fmtDate,
} from "../utils/cloudBase.js";
import { PAGE_SIZE } from "../config/cloud.js";
import Modal from "../components/Modal.vue";

const emit = defineEmits(["sync"]);
const toast = inject("toast");
const loading = inject("loading");

const allSeats = ref([]);
const filteredSeats = ref([]);
const searchText = ref("");
const statusFilter = ref("");
const selectedSeatIds = ref([]);
const currentPage = ref(1);
const showModal = ref(false);
const modalTitle = ref("添加座位");
const editId = ref("");
const formData = ref({
  seatNumber: "",
  area: "",
  seatType: "normal",
  remark: "",
});

const seatStats = computed(() => {
  const total = allSeats.value.length;
  const free = allSeats.value.filter(
    (s) => s.status === "空闲" || s.status === "free"
  ).length;
  const inUse = allSeats.value.filter((s) => s.status === "使用中").length;
  const maintenance = allSeats.value.filter((s) => s.status === "维护中").length;
  const rate = total > 0 ? ((inUse / total) * 100).toFixed(1) : 0;
  return { total, free, inUse, maintenance, rate };
});

const totalPages = computed(() =>
  Math.ceil(filteredSeats.value.length / PAGE_SIZE)
);

const paginatedSeats = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredSeats.value.slice(start, start + PAGE_SIZE);
});

const visiblePages = computed(() => {
  const maxVisible = 7;
  let start = Math.max(1, currentPage.value - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages.value, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
});

const isAllSelected = computed(() => {
  const available = filteredSeats.value.filter((s) => s.status === "使用中");
  return (
    available.length > 0 &&
    available.every((s) => selectedSeatIds.value.includes(s._id))
  );
});

const getStatusClass = (status) => {
  switch (status) {
    case "空闲":
    case "free":
      return "status-free";
    case "使用中":
      return "status-in-use";
    case "维护中":
      return "status-maintenance";
    default:
      return "status-unknown";
  }
};

const getStatusLabel = (status) => {
  switch (status) {
    case "空闲":
    case "free":
      return "空闲";
    case "使用中":
      return "使用中";
    case "维护中":
      return "维护中";
    default:
      return status || "未知";
  }
};

const loadSeats = async () => {
  loading.showLoadingState(true);
  try {
    const ready = await ensureCloudReady();
    if (!ready) throw new Error("云开发初始化失败");

    const db = getDB();
    if (!db) {
      throw new Error("数据库连接失败");
    }

    const res = await db.collection("seats").get();
    allSeats.value = res.data || [];
    filterSeats();
  } catch (error) {
    console.error("加载座位失败:", error);
    toast.showToastMessage("加载座位数据失败", "error");
  }
  loading.showLoadingState(false);
};

const filterSeats = () => {
  filteredSeats.value = allSeats.value
    .filter((seat) => {
      if (statusFilter.value && seat.status !== statusFilter.value)
        return false;
      if (
        searchText.value &&
        !(seat.seatNumber || "")
          .toLowerCase()
          .includes(searchText.value.toLowerCase())
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      const numA = parseInt(a.seatNumber) || 0;
      const numB = parseInt(b.seatNumber) || 0;
      return numA - numB;
    });
  currentPage.value = 1;
};

const toggleSelectAll = (e) => {
  if (e.target.checked) {
    selectedSeatIds.value = filteredSeats.value
      .filter((s) => s.status === "使用中")
      .map((s) => s._id);
  } else {
    selectedSeatIds.value = [];
  }
};

const forceRelease = async (seat) => {
  if (
    !confirm(
      `确定要强制释放座位 ${seat.seatNumber} 吗？\n\n此操作将通过服务端云函数执行，中断该用户的使用并保存学习记录。`
    )
  ) {
    return;
  }

  loading.showLoadingState(true);

  try {
    const result = await callCloudFunction("adminOperations", {
      action: "forceReleaseSeat",
      seatId: seat._id,
      source: "admin_panel",
    });

    if (result.success) {
      toast.showToastMessage(
        `✅ 座位 ${seat.seatNumber} 已成功释放`,
        "success"
      );
      emit("sync");
      await loadSeats();
    } else {
      throw new Error(result.error || "云函数返回异常");
    }
  } catch (error) {
    console.error("强制释放失败:", error);
    toast.showToastMessage("强制释放失败: " + error.message, "error");
  }

  loading.showLoadingState(false);
};

const setMaintenance = async (seat) => {
  if (
    !confirm(
      `确定要将座位 ${seat.seatNumber} 设为维护中吗？\n\n设为维护中后，该座位将无法被用户预订，直到管理员恢复。`
    )
  ) {
    return;
  }

  loading.showLoadingState(true);

  try {
    const result = await callCloudFunction("adminOperations", {
      action: "setMaintenance",
      seatId: seat._id,
      source: "admin_panel",
    });

    if (result.success) {
      toast.showToastMessage(
        `🔧 座位 ${seat.seatNumber} 已设为维护中`,
        "success"
      );
      emit("sync");
      await loadSeats();
    } else {
      throw new Error(result.error || "操作失败");
    }
  } catch (error) {
    console.error("设置维护失败:", error);
    toast.showToastMessage("设置维护失败: " + error.message, "error");
  }

  loading.showLoadingState(false);
};

const restoreSeat = async (seat) => {
  if (
    !confirm(
      `确定要将座位 ${seat.seatNumber} 恢复为空闲吗？\n\n恢复后该座位将可被用户正常预订。`
    )
  ) {
    return;
  }

  loading.showLoadingState(true);

  try {
    const result = await callCloudFunction("adminOperations", {
      action: "restoreSeat",
      seatId: seat._id,
      source: "admin_panel",
    });

    if (result.success) {
      toast.showToastMessage(
        `✅ 座位 ${seat.seatNumber} 已恢复为空闲`,
        "success"
      );
      emit("sync");
      await loadSeats();
    } else {
      throw new Error(result.error || "操作失败");
    }
  } catch (error) {
    console.error("恢复座位失败:", error);
    toast.showToastMessage("恢复座位失败: " + error.message, "error");
  }

  loading.showLoadingState(false);
};

const batchRelease = async () => {
  if (selectedSeatIds.value.length === 0) {
    toast.showToastMessage("请先勾选需要释放的座位", "warning");
    return;
  }

  if (
    !confirm(`确定要批量释放选中的 ${selectedSeatIds.value.length} 个座位吗？`)
  ) {
    return;
  }

  loading.showLoadingState(true);

  try {
    const result = await callCloudFunction("adminOperations", {
      action: "batchReleaseSeats",
      seatIds: selectedSeatIds.value,
      source: "admin_batch",
    });

    if (result.success) {
      toast.showToastMessage(
        `批量释放完成：成功 ${result.releasedCount} 个`,
        "success"
      );
      emit("sync");
      selectedSeatIds.value = [];
      await loadSeats();
    }
  } catch (error) {
    toast.showToastMessage("批量释放失败: " + error.message, "error");
  }

  loading.showLoadingState(false);
};

const openAddModal = () => {
  modalTitle.value = "添加座位";
  editId.value = "";
  formData.value = { seatNumber: "", area: "", seatType: "normal", remark: "" };
  showModal.value = true;
};

const openEditModal = (seat) => {
  modalTitle.value = "编辑座位";
  editId.value = seat._id;
  formData.value = {
    seatNumber: seat.seatNumber || "",
    area: seat.area || "",
    seatType: seat.seatType || "normal",
    remark: seat.remark || "",
  };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const saveSeat = async () => {
  if (!formData.value.seatNumber) {
    toast.showToastMessage("请输入座位号", "warning");
    return;
  }

  loading.showLoadingState(true);

  try {
    const db = getDB();
    const now = new Date();

    if (editId.value) {
      await db
        .collection("seats")
        .doc(editId.value)
        .update({
          data: { ...formData.value, updatedAt: now },
        });
      toast.showToastMessage(
        `座位 ${formData.value.seatNumber} 已更新`,
        "success"
      );
    } else {
      const duplicate = allSeats.value.find(
        (s) => s.seatNumber === formData.value.seatNumber
      );
      if (duplicate) {
        toast.showToastMessage("该座位号已存在", "warning");
        loading.showLoadingState(false);
        return;
      }

      await db.collection("seats").add({
        data: {
          ...formData.value,
          status: "空闲",
          userId: "",
          openid: "",
          orderId: "",
          reservedAt: null,
          startedAt: null,
          expireAt: null,
          remainingTime: 0,
          autoReleaseAt: null,
          hardwareStatus: { light: false, airConditioner: false, door: false },
          createdAt: now,
          updatedAt: now,
        },
      });
      toast.showToastMessage(
        `座位 ${formData.value.seatNumber} 已添加`,
        "success"
      );
    }

    closeModal();
    await loadSeats();
  } catch (error) {
    toast.showToastMessage("保存失败: " + error.message, "error");
  }

  loading.showLoadingState(false);
};

const deleteSeat = async (seat) => {
  if (!confirm(`确定要删除座位 ${seat.seatNumber} 吗？\n\n此操作不可恢复！`))
    return;

  if (seat.status === "使用中") {
    toast.showToastMessage("该座位正在使用中，请先释放再删除", "warning");
    return;
  }

  loading.showLoadingState(true);

  try {
    const result = await callCloudFunction("adminOperations", {
      action: "deleteSeat",
      seatId: seat._id,
      source: "admin_panel",
    });

    if (result.success) {
      toast.showToastMessage(`座位 ${seat.seatNumber} 已删除`, "success");
      emit("sync");
      await loadSeats();
    } else {
      throw new Error(result.error || "删除失败");
    }
  } catch (error) {
    toast.showToastMessage("删除失败: " + error.message, "error");
  }

  loading.showLoadingState(false);
};

const formatDate = fmtDate;

loadSeats();
</script>

<style scoped>
.stats-grid {
  display: grid;
  gap: 18px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--color-surface);
  padding: 20px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-card);
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 4px 0 0 4px;
}

.stat-card.stat-total::before {
  background: var(--color-primary);
}
.stat-card.stat-free::before {
  background: var(--color-success);
}
.stat-card.stat-inuse::before {
  background: #f59e0b;
}
.stat-card.stat-maintenance::before {
  background: #8b5cf6;
}
.stat-card.stat-rate::before {
  background: var(--color-error);
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-hover);
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.stat-total .stat-icon {
  background: var(--color-primary-bg);
}
.stat-free .stat-icon {
  background: var(--color-success-bg);
}
.stat-inuse .stat-icon {
  background: #fef3c7;
}
.stat-maintenance .stat-icon {
  background: #f3eeff;
}
.stat-rate .stat-icon {
  background: var(--color-error-bg);
}

.stat-body {
  flex: 1;
  min-width: 0;
}

.stat-body h3 {
  color: var(--color-text-aux);
  font: var(--font-small);
  margin-bottom: 4px;
  letter-spacing: 0.3px;
}

.stat-body .number {
  font: 700 26px/1.2 var(--font-family);
  color: var(--color-text-primary);
}

.stat-free .number {
  color: var(--color-success);
}
.stat-inuse .number {
  color: #f59e0b;
}
.stat-maintenance .number {
  color: #8b5cf6;
}
.stat-rate .number {
  color: var(--color-error);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  gap: 10px;
}

.checkbox-cell {
  width: 40px;
  text-align: center;
}

.checkbox-cell input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.action-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.page-btn {
  padding: 8px 14px;
  border: 2px solid #e1e1e1;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.3s;
}

.page-btn:hover:not(:disabled) {
  border-color: #667eea;
  color: #667eea;
}

.page-btn.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  color: #666;
  margin-bottom: 8px;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid #e1e1e1;
  border-radius: 6px;
  font-size: 14px;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
</style>
