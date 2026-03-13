import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import "./alba-finance.css";
import { auth, db, isFirebaseConfigured } from "./firebase";

const AlbaAnalytics = lazy(() => import("./AlbaAnalytics"));

const initialAccounts = [
  { id: "acc-1", name: "Основний банк", balance: 4800.25, type: "bank" },
  { id: "acc-2", name: "Сімейна готівка", balance: 620.0, type: "cash" },
  { id: "acc-3", name: "Скарбничка", balance: 13250.1, type: "savings" },
];

const initialIncomes = [
  { id: "inc-1", name: "Зарплата", amount: 52000 },
  { id: "inc-2", name: "Підробіток", amount: 8400 },
];

const initialCategories = [
  { id: "cat-1", name: "Їжа", icon: "ЇЖ" },
  { id: "cat-2", name: "Оренда", icon: "ОР" },
  { id: "cat-3", name: "Розваги", icon: "РЗ" },
  { id: "cat-4", name: "Транспорт", icon: "ТР" },
  { id: "cat-5", name: "Здоров'я", icon: "ЗД" },
  { id: "cat-6", name: "Рахунки", icon: "РХ" },
];

const tabs = [
  { id: "home", label: "Головна", icon: "⌂" },
  { id: "analytics", label: "Аналітика", icon: "◔" },
  { id: "family", label: "Сім'я", icon: "◯" },
  { id: "settings", label: "Налаштування", icon: "⚙" },
];

const categoryIconPresets = [
  "🛒",
  "🛍",
  "🥖",
  "🥦",
  "🍎",
  "🍽",
  "☕",
  "🍰",
  "🏠",
  "🏡",
  "🔑",
  "💳",
  "💵",
  "💰",
  "💸",
  "🏦",
  "📈",
  "📊",
  "🚕",
  "🚗",
  "🚌",
  "🚲",
  "⛽",
  "💊",
  "🩺",
  "🦷",
  "🎁",
  "🎬",
  "🎮",
  "🎓",
  "📚",
  "👕",
  "👟",
  "📱",
  "💻",
  "🧾",
  "📄",
  "🐶",
  "🐱",
  "✈",
  "🚆",
  "🏨",
  "🛠",
  "🔧",
  "🪑",
  "⚽",
  "🏋",
  "📦",
  "💡",
  "🌿",
  "🧴",
  "🧹",
  "🍼",
  "❤️",
  "🪙",
  "🧠",
  "📉",
  "🧮",
  "🧑‍💼",
  "🪪",
  "📬",
  "🗂",
  "🏬",
  "🏪",
  "🧺",
  "🍔",
  "🍕",
  "🍣",
  "🥗",
  "🥛",
  "🏥",
  "🧻",
  "🪥",
  "💄",
  "🧸",
  "🎨",
  "🎵",
  "🏊",
  "🧳",
  "🚇",
  "🚚",
  "🛵",
  "🏖",
  "🧷",
  "🪴",
  "🧯",
  "🧱",
  "🔌",
  "📡",
  "🔋",
  "🗑",
  "🔒",
  "🧑‍🍼",
  "👶",
  "🐾",
  "🎀",
];

function money(value) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildInitials(value) {
  const source = (value || "Користувач").replace(/@.*/, "");
  const parts = source.split(/[._\s-]+/).filter(Boolean);

  if (parts.length === 0) return "КР";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "").trim();
  if (normalized.length !== 6) return null;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function buildCategoryCircleStyle(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return undefined;
  return {
    borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.78)`,
    background: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.82)`,
  };
}

function monthKeyFromValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 7);
  if (value?.toDate) {
    const date = value.toDate();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${date.getFullYear()}-${month}`;
  }
  return "";
}

function currentMonthKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function triggerHaptic(pattern = 18) {
  if (typeof window === "undefined") return;
  const nav = window.navigator;
  if (!nav || typeof nav.vibrate !== "function") return;
  if (window.isSecureContext === false) return;
  try {
    nav.vibrate(0);
    const normalized = Array.isArray(pattern) ? pattern : [pattern];
    const success = nav.vibrate(normalized);
    if (!success && normalized.length) {
      nav.vibrate(Math.max(16, Number(normalized[0]) || 18));
    }
  } catch {
    // Ignore unsupported haptic feedback implementations.
  }
}

function monthKeyToDate(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return null;
  const [year, month] = monthKey.split("-").map((value) => Number(value));
  if (!year || !month) return null;
  return new Date(year, month - 1, 1);
}

function transactionDateFromValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function transactionTimestamp(value) {
  const parsed = transactionDateFromValue(value);
  return parsed ? parsed.getTime() : 0;
}

function transactionAmountImpact(transaction, amountOverride = null) {
  const rawAmount = amountOverride == null ? transaction?.amount : amountOverride;
  const amount = Number(rawAmount || 0);
  if (!Number.isFinite(amount) || !amount) return 0;
  return transaction?.type === "income" ? amount : -amount;
}

function isMonthInRange(monthKey, range) {
  if (range === "all") return true;
  const targetDate = monthKeyToDate(monthKey);
  if (!targetDate) return false;
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), 1);

  if (range === "month") {
    return targetDate.getFullYear() === current.getFullYear() && targetDate.getMonth() === current.getMonth();
  }

  if (range === "quarter") {
    const quarterStartMonth = Math.floor(current.getMonth() / 3) * 3;
    const quarterStart = new Date(current.getFullYear(), quarterStartMonth, 1);
    return targetDate >= quarterStart && targetDate <= current;
  }

  if (range === "year") {
    return targetDate.getFullYear() === current.getFullYear();
  }

  return true;
}

export default function AlbaFinanceApp() {
  const LOCAL_SUBCATEGORIES_KEY = "alba-local-subcategories-v1";
  const categoryHoverRef = useRef({ timer: null });
  const categoryPressRef = useRef({ timer: null, fired: false, startX: 0, startY: 0 });
  const [authResolved, setAuthResolved] = useState(!auth);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [familyMembers, setFamilyMembers] = useState([]);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("andrii.disha@gmail.com");
  const [authPassword, setAuthPassword] = useState("October2020!");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [firebaseDataReady, setFirebaseDataReady] = useState(!isFirebaseConfigured);
  const [incomes, setIncomes] = useState(() => (isFirebaseConfigured ? [] : initialIncomes));
  const [accounts, setAccounts] = useState(() => (isFirebaseConfigured ? [] : initialAccounts));
  const [categories, setCategories] = useState(() => (isFirebaseConfigured ? [] : initialCategories));
  const [subcategories, setSubcategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isIncomesOpen, setIsIncomesOpen] = useState(false);
  const [isAccountsOpen, setIsAccountsOpen] = useState(true);
  const [isExpensesOpen, setIsExpensesOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("home");
  const [analyticsRange, setAnalyticsRange] = useState("all");
  const [draggedIncomeId, setDraggedIncomeId] = useState(null);
  const [draggedAccountId, setDraggedAccountId] = useState(null);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [entry, setEntry] = useState("0");
  const [target, setTarget] = useState(null);
  const [transactionJournalOpen, setTransactionJournalOpen] = useState(false);
  const [transactionDrafts, setTransactionDrafts] = useState({});
  const [transactionJournalBusyId, setTransactionJournalBusyId] = useState(null);
  const [transactionSwipeOffset, setTransactionSwipeOffset] = useState({});
  const [transactionSwipeDeletingId, setTransactionSwipeDeletingId] = useState(null);
  const [journalEditingTransactionId, setJournalEditingTransactionId] = useState(null);
  const [transactionJournalOffsetY, setTransactionJournalOffsetY] = useState(0);
  const [transactionJournalClosing, setTransactionJournalClosing] = useState(false);
  const [transactionJournalDragging, setTransactionJournalDragging] = useState(false);
  const [categoryMenu, setCategoryMenu] = useState(null);
  const [itemMenu, setItemMenu] = useState(null);
  const [itemEditor, setItemEditor] = useState(null);
  const [categoryEditor, setCategoryEditor] = useState(null);
  const [categoryEditorOffsetY, setCategoryEditorOffsetY] = useState(0);
  const [categoryIconPickerOpen, setCategoryIconPickerOpen] = useState(false);
  const [subcategoryEditor, setSubcategoryEditor] = useState(null);
  const [subcategoryEditorOffsetY, setSubcategoryEditorOffsetY] = useState(0);
  const [subcategoryIconPicker, setSubcategoryIconPicker] = useState(null);
  const [categoryEditMode, setCategoryEditMode] = useState(false);
  const [draggedCategoryId, setDraggedCategoryId] = useState(null);
  const [activeExpenseDropId, setActiveExpenseDropId] = useState(null);
  const [hoveredDropCategoryId, setHoveredDropCategoryId] = useState(null);
  const [hoveredDropSubcategoryId, setHoveredDropSubcategoryId] = useState(null);
  const [subcatAnchor, setSubcatAnchor] = useState({ x: 0, y: 0 });
  const [syncMode, setSyncMode] = useState(isFirebaseConfigured ? "firebase" : "local");
  const touchHoldRef = useRef({ timer: null, fired: false });
  const categoryReorderRef = useRef({
    ghost: null,
    sourceId: null,
    overId: null,
    moved: false,
    startX: 0,
    startY: 0,
    previewItems: [],
  });
  const categoryEditorSaveTimerRef = useRef(null);
  const categoryEditorDragRef = useRef({ active: false, startY: 0, pointerId: null });
  const subcategoryEditorDragRef = useRef({ active: false, startY: 0, pointerId: null });
  const transparentDragImageRef = useRef(null);
  const keypadDisplayDragRef = useRef({ active: false, startY: 0, pointerId: null });
  const transactionSwipeRef = useRef({ id: null, startX: 0, pointerId: null, active: false });
  const transactionJournalDragRef = useRef({ active: false, startX: 0, startY: 0, pointerId: null });
  const journalNativeInputRef = useRef(null);
  const transactionJournalCloseTimerRef = useRef(null);

  function buildSubcategoryCircleStyle(parentCategoryId) {
    const parentCategory = categories.find((item) => item.id === parentCategoryId);
    return buildCategoryCircleStyle(parentCategory?.color || "#c96f55");
  }

  function sortCategoriesByOrder(items) {
    return [...items].sort((left, right) => {
      const leftOrder = Number.isFinite(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return String(left.id).localeCompare(String(right.id));
    });
  }

  function applyCategoryOrder(nextCategories) {
    const previousRects = new Map(
      categories.map((item) => {
        const element = document.querySelector(`[data-reorder-category="${item.id}"]`);
        return [item.id, element?.getBoundingClientRect() || null];
      })
    );

    const normalized = nextCategories.map((item, index) => ({ ...item, sortOrder: index }));
    setCategories(normalized);

    requestAnimationFrame(() => {
      normalized.forEach((item) => {
        const element = document.querySelector(`[data-reorder-category="${item.id}"]`);
        const prev = previousRects.get(item.id);
        const next = element?.getBoundingClientRect();
        if (!element || !prev || !next) return;
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (dx === 0 && dy === 0) return;
        element.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      });
    });

    return normalized;
  }

  function moveCategoryInList(items, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return null;
    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0) return null;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  async function persistCategoryOrder(nextCategories) {
    const normalized = applyCategoryOrder(nextCategories);

    if (db && currentUserId) {
      try {
        await Promise.all(
          normalized.map((item) =>
            updateDoc(doc(db, "users", currentUserId, "categories", item.id), { sortOrder: item.sortOrder })
          )
        );
      } catch {
        window.alert("Не вдалося зберегти порядок категорій у Firebase.");
      }
    }
  }

  function reorderCategories(fromId, toId) {
    const current = sortCategoriesByOrder(categories);
    const next = moveCategoryInList(current, fromId, toId);
    if (!next) return;
    persistCategoryOrder(next);
  }

  function previewCategoryOrder(fromId, toId, currentItems = sortCategoriesByOrder(categories)) {
    const next = moveCategoryInList(currentItems, fromId, toId);
    if (!next) return currentItems;
    return applyCategoryOrder(next);
  }

  function openCategoryMenu(categoryId) {
    const rect = document
      .querySelector(`[data-reorder-category="${categoryId}"] .alba-category-card`)
      ?.getBoundingClientRect();
    if (!rect) return;
    setCategoryMenu({
      categoryId,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }

  function openCategoryEditor(category) {
    if (categoryEditorSaveTimerRef.current) {
      clearTimeout(categoryEditorSaveTimerRef.current);
      categoryEditorSaveTimerRef.current = null;
    }
    setCategoryEditorOffsetY(0);
    setCategoryIconPickerOpen(false);
    setCategoryEditor({
      id: category.id,
      name: category.name || "",
      icon: category.icon || buildInitials(category.name || "Категорія"),
      color: category.color || "#c96f55",
    });
    setCategoryEditMode(false);
  }

  function openCreateCategoryEditor() {
    if (categoryEditorSaveTimerRef.current) {
      clearTimeout(categoryEditorSaveTimerRef.current);
      categoryEditorSaveTimerRef.current = null;
    }
    setCategoryEditorOffsetY(0);
    setCategoryIconPickerOpen(false);
    setCategoryEditor({
      id: null,
      name: "",
      icon: "",
      color: "#c96f55",
    });
    setCategoryEditMode(false);
  }

  async function persistCategoryEditorDraft(draft, options = { showError: false }) {
    if (!draft) return;

    const payload = {
      name: String(draft.name || "").trim() || "Нова категорія",
      icon: String(draft.icon || "").trim() || buildInitials(draft.name || "Категорія"),
      color: String(draft.color || "#c96f55"),
    };

    if (!draft.id) {
      const nextOrder = sortCategoriesByOrder(categories).length;
      if (db && currentUserId) {
        try {
          await addDoc(collection(db, "users", currentUserId, "categories"), {
            ...payload,
            sortOrder: nextOrder,
            createdAt: serverTimestamp(),
          });
        } catch {
          if (options.showError) {
            window.alert("Не вдалося створити категорію у Firebase.");
          }
        }
      } else {
        setCategories((prev) => [...prev, { id: `cat-${Date.now()}`, ...payload, sortOrder: nextOrder }]);
      }
      return;
    }

    const current = categories.find((item) => item.id === draft.id);
    const isSame =
      current &&
      (current.name || "") === payload.name &&
      (current.icon || "") === payload.icon &&
      (current.color || "#c96f55") === payload.color;

    if (isSame) return;

    setCategories((prev) => prev.map((item) => (item.id === draft.id ? { ...item, ...payload } : item)));

    if (db && currentUserId) {
      try {
        await updateDoc(doc(db, "users", currentUserId, "categories", draft.id), payload);
      } catch {
        if (options.showError) {
          window.alert("Не вдалося зберегти зміни категорії у Firebase.");
        }
      }
    }
  }

  function closeCategoryEditor() {
    const draft = categoryEditor;
    if (categoryEditorSaveTimerRef.current) {
      clearTimeout(categoryEditorSaveTimerRef.current);
      categoryEditorSaveTimerRef.current = null;
    }
    setCategoryEditor(null);
    setCategoryEditorOffsetY(0);
    setCategoryIconPickerOpen(false);
    categoryEditorDragRef.current = { active: false, startY: 0, pointerId: null };
    if (draft) {
      void persistCategoryEditorDraft(draft, { showError: true });
    }
  }

  function handleCategoryEditorDragStart(event) {
    if (!categoryEditor) return;
    categoryEditorDragRef.current = {
      active: true,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
  }

  function handleCategoryEditorDragMove(event) {
    const drag = categoryEditorDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - drag.startY);
    setCategoryEditorOffsetY(Math.min(240, dy));
  }

  function handleCategoryEditorDragEnd(event) {
    const drag = categoryEditorDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    categoryEditorDragRef.current = { active: false, startY: 0, pointerId: null };
    if (categoryEditorOffsetY > 90) {
      closeCategoryEditor();
      return;
    }
    setCategoryEditorOffsetY(0);
  }

  function buildSubcategoryLayout(parentCategoryId) {
    const allItems = subcategories.filter((s) => s.parentCategoryId === parentCategoryId).slice(0, 5);
    const RADIUS = 92;
    const CARD_W = 60;
    const CARD_H = 70;
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const categoryIndex = categories.findIndex((item) => item.id === parentCategoryId);
    const GRID_COLUMNS = 5;
    const columnIndex = categoryIndex >= 0 ? categoryIndex % GRID_COLUMNS : -1;
    const hasColumnInfo = columnIndex >= 0;
    const isLeftEdge = hasColumnInfo ? columnIndex === 0 : subcatAnchor.x < 58;
    const isRightEdge = hasColumnInfo ? columnIndex === GRID_COLUMNS - 1 : subcatAnchor.x > vw - 58;
    const edgeMode = isLeftEdge || isRightEdge;
    const items = allItems;

    const angles = edgeMode
      ? isRightEdge
        ? [0, -45, -90, -135, -180]
        : [0, 45, 90, 135, 180]
      : [220, 270, 320, 10, 60];

    return items.map((subcategory, idx) => {
      // Базово старт з 12:00; для крайніх категорій - до 5 підкатегорій "всередину".
      const angleDeg = angles[idx] ?? 0;
      const rad = (angleDeg * Math.PI) / 180;
      const rawX = subcatAnchor.x + Math.round(Math.sin(rad) * RADIUS);
      const rawY = subcatAnchor.y + Math.round(-Math.cos(rad) * RADIUS);
      const centerX = Math.max(CARD_W / 2 + 4, Math.min(vw - CARD_W / 2 - 4, rawX));
      const centerY = Math.max(CARD_H / 2 + 4, Math.min(vh - CARD_H / 2 - 4, rawY));

      return {
        subcategory,
        idx,
        centerX,
        centerY,
        left: centerX - CARD_W / 2,
        top: centerY - CARD_H / 2,
        width: CARD_W,
        isPeripheral: edgeMode && idx >= 3,
      };
    });
  }

  function hasSubcategoriesForCategory(categoryId) {
    if (!categoryId) return false;
    return subcategories.some((item) => item.parentCategoryId === categoryId);
  }

  function buildSubcategoryZoneRadius(layout) {
    if (!layout.length) return 0;
    // Стабільна зона по кількості підкатегорій, щоб поведінка не "плавала" між категоріями.
    const countRadiusMap = {
      1: 74,
      2: 82,
      3: 90,
      4: 102,
      5: 114,
    };
    return countRadiusMap[layout.length] || 114;
  }

  // Touch drag-and-drop support for mobile
  const touchDragRef = useRef({
    type: null,
    item: null,
    ghost: null,
    startX: 0,
    startY: 0,
    moved: false,
  });

  function clearTouchHoldTimer() {
    if (touchHoldRef.current.timer) {
      clearTimeout(touchHoldRef.current.timer);
      touchHoldRef.current.timer = null;
    }
  }

  function handleTouchStart(type, item, event) {
    event.preventDefault();
    const touch = event.touches[0];
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.className = "alba-drag-ghost";
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${touch.clientX - rect.width / 2}px`;
    ghost.style.top = `${touch.clientY - rect.height / 2}px`;
    document.body.appendChild(ghost);
    touchDragRef.current = {
      type,
      item,
      ghost,
      startX: touch.clientX,
      startY: touch.clientY,
      moved: false,
    };
    if (type === "income") {
      setDraggedIncomeId(item.id);
      setDraggedAccountId(null);
    } else {
      setDraggedAccountId(item.id);
      setDraggedIncomeId(null);
    }

    touchHoldRef.current.fired = false;
    clearTouchHoldTimer();
    touchHoldRef.current.timer = setTimeout(() => {
      if (touchDragRef.current.moved) return;
      touchHoldRef.current.fired = true;
      triggerHaptic([18, 24, 18]);
      if (touchDragRef.current.ghost) {
        touchDragRef.current.ghost.remove();
      }
      setDraggedIncomeId(null);
      setDraggedAccountId(null);
      setActiveExpenseDropId(null);
      setItemMenu({
        type,
        id: item.id,
        x: touch.clientX,
        y: touch.clientY,
      });
      touchDragRef.current = {
        type: null,
        item: null,
        ghost: null,
        startX: 0,
        startY: 0,
        moved: false,
      };
    }, 560);
  }

  function handleTouchMove(event) {
    const drag = touchDragRef.current;
    if (!drag.ghost) return;
    const touch = event.touches[0];
    const dx = touch.clientX - drag.startX;
    const dy = touch.clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      drag.moved = true;
      clearTouchHoldTimer();
    }
    if (drag.moved) {
      event.preventDefault();
      drag.ghost.style.left = `${touch.clientX - drag.ghost.offsetWidth / 2}px`;
      drag.ghost.style.top = `${touch.clientY - drag.ghost.offsetHeight / 2}px`;
      if (drag.type === "account") {
        const hovered = document.elementFromPoint(touch.clientX, touch.clientY);
        const activeLayout = activeExpenseDropId ? buildSubcategoryLayout(activeExpenseDropId) : [];
        const activeZoneRadius = buildSubcategoryZoneRadius(activeLayout);

        const withinZone =
          !!activeExpenseDropId &&
          !!activeLayout.length &&
          Math.hypot(touch.clientX - subcatAnchor.x, touch.clientY - subcatAnchor.y) <= activeZoneRadius;
        if (withinZone) {
          let nearest = null;
          let minDist = Number.POSITIVE_INFINITY;
          for (const item of activeLayout) {
            const dist = Math.hypot(touch.clientX - item.centerX, touch.clientY - item.centerY);
            if (dist < minDist) {
              minDist = dist;
              nearest = item;
            }
          }
          setHoveredDropCategoryId(activeExpenseDropId);
          setHoveredDropSubcategoryId(nearest && minDist <= 44 ? nearest.subcategory.id : null);
          return;
        }

        setHoveredDropSubcategoryId(null);

        const expenseCategoryEl = hovered?.closest("[data-expense-category]");
        const newCatId = expenseCategoryEl ? expenseCategoryEl.getAttribute("data-expense-category") : null;
        const canExpand = !!newCatId && hasSubcategoriesForCategory(newCatId);
        setHoveredDropCategoryId(newCatId);

        if (categoryHoverRef.current.timer) {
          clearTimeout(categoryHoverRef.current.timer);
          categoryHoverRef.current.timer = null;
        }

        if (canExpand && newCatId === activeExpenseDropId) {
          setHoveredDropCategoryId(newCatId);
          setHoveredDropSubcategoryId(null);
          return;
        }

        if (!canExpand) {
          setActiveExpenseDropId(null);
          setHoveredDropSubcategoryId(null);
          return;
        }

        // Щоб підкатегорії не зникали миттєво біля сусідньої категорії.
        categoryHoverRef.current.timer = setTimeout(
          () => {
            setActiveExpenseDropId(newCatId);
            setHoveredDropCategoryId(newCatId);
            if (expenseCategoryEl) {
              const r = expenseCategoryEl.getBoundingClientRect();
              setSubcatAnchor({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }
          },
          newCatId ? 120 : 110
        );
      }
    }
  }

  function handleTouchEnd(event) {
    event.preventDefault();
    clearTouchHoldTimer();
    if (touchHoldRef.current.fired) {
      touchHoldRef.current.fired = false;
      return;
    }
    const drag = touchDragRef.current;
    if (!drag.ghost) return;
    drag.ghost.remove();
    if (drag.moved) {
      const touch = event.changedTouches[0];

      if (drag.type === "account" && activeExpenseDropId) {
        const layout = buildSubcategoryLayout(activeExpenseDropId);
        let nearest = null;
        let minDist = Number.POSITIVE_INFINITY;

        for (const item of layout) {
          const dx = touch.clientX - item.centerX;
          const dy = touch.clientY - item.centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            nearest = item;
          }
        }

        if (nearest && minDist <= 44) {
          const parentCategory = categories.find((c) => c.id === activeExpenseDropId);
          if (parentCategory) {
            handleDropOnSubcategory(parentCategory, nearest.subcategory, drag.item);
          }
          setDraggedIncomeId(null);
          setDraggedAccountId(null);
          setHoveredDropSubcategoryId(null);
          setHoveredDropCategoryId(null);
          if (categoryHoverRef.current.timer) {
            clearTimeout(categoryHoverRef.current.timer);
            categoryHoverRef.current.timer = null;
          }
          touchDragRef.current = {
            type: null,
            item: null,
            ghost: null,
            startX: 0,
            startY: 0,
            moved: false,
          };
          return;
        }
      }

      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (target) {
        const dropEl =
          target.closest("[data-drop-account]") ||
          target.closest("[data-drop-subcategory]") ||
          target.closest("[data-drop-category]");
        if (dropEl) {
          const accountId = dropEl.getAttribute("data-drop-account");
          const subcategoryId = dropEl.getAttribute("data-drop-subcategory");
          const categoryId = dropEl.getAttribute("data-drop-category");
          if (accountId && drag.type === "income") {
            const account = accounts.find((a) => a.id === accountId);
            if (account) handleDropIncomeOnAccount(account, drag.item);
          } else if (subcategoryId && drag.type === "account") {
            const subcategory = subcategories.find((s) => s.id === subcategoryId);
            if (subcategory) {
              const parentCategory = categories.find((c) => c.id === subcategory.parentCategoryId);
              if (parentCategory) handleDropOnSubcategory(parentCategory, subcategory, drag.item);
            }
          } else if (categoryId && drag.type === "account") {
            const category = categories.find((c) => c.id === categoryId);
            if (category) handleDropOnCategory(category, drag.item);
          }
        }
      }
    }
    setDraggedIncomeId(null);
    setDraggedAccountId(null);
    setHoveredDropCategoryId(null);
    setHoveredDropSubcategoryId(null);
    if (categoryHoverRef.current.timer) {
      clearTimeout(categoryHoverRef.current.timer);
      categoryHoverRef.current.timer = null;
    }
    // Невелика затримка, щоб уникнути візуального миготіння при завершенні дропу.
    setTimeout(() => {
      setActiveExpenseDropId(null);
    }, 140);
    touchDragRef.current = {
      type: null,
      item: null,
      ghost: null,
      startX: 0,
      startY: 0,
      moved: false,
    };
  }

  useEffect(() => {
    if (!auth) return;

    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthResolved(true);
      if (user) {
        setIsAuthenticated(true);
        setCurrentUserId(user.uid);
        setUserEmail(user.email || "");
        setAuthError("");
        return;
      }

      setIsAuthenticated(false);
      setCurrentUserId("");
      setUserEmail("");
      setFamilyMembers([]);
      setFirebaseDataReady(true);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (db) return;
    try {
      const raw = window.localStorage.getItem(LOCAL_SUBCATEGORIES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSubcategories(parsed);
      }
    } catch {
      // Ignore broken local cache.
    }
  }, [db]);

  useEffect(() => {
    if (db) return;
    try {
      window.localStorage.setItem(LOCAL_SUBCATEGORIES_KEY, JSON.stringify(subcategories));
    } catch {
      // Ignore storage write failures.
    }
  }, [db, subcategories]);

  useEffect(() => {
    if (!db || !currentUserId) return;
    try {
      window.localStorage.removeItem(LOCAL_SUBCATEGORIES_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }, [db, currentUserId]);

  useEffect(() => {
    return () => {
      if (categoryHoverRef.current.timer) {
        clearTimeout(categoryHoverRef.current.timer);
      }
    };
  }, []);

  useEffect(() => {
    if (!categoryEditMode) return;

    function handleOutsidePointer(event) {
      const targetNode = event.target;
      if (!(targetNode instanceof Element)) return;
      if (targetNode.closest(".alba-category-wrap") || targetNode.closest(".alba-category-menu")) {
        return;
      }
      setCategoryMenu(null);
      setCategoryEditMode(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, [categoryEditMode]);

  useEffect(() => {
    const image = new Image();
    image.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    transparentDragImageRef.current = image;
  }, []);

  useEffect(() => {
    if (!db) {
      setFirebaseDataReady(true);
      if (syncMode !== "local") {
        setSyncMode("local");
      }

      if (isAuthenticated) {
        setFamilyMembers([
          {
            id: "local-self",
            displayName: userEmail || "Мій профіль",
            email: userEmail || "",
          },
        ]);
      }

      return;
    }

    if (!currentUserId) {
      setFirebaseDataReady(true);
      return;
    }

    setFirebaseDataReady(false);
    const bootstrap = {
      incomes: false,
      accounts: false,
      categories: false,
      subcategories: false,
      family: false,
      transactions: false,
    };

    function markReady(key) {
      bootstrap[key] = true;
      if (Object.values(bootstrap).every(Boolean)) {
        setFirebaseDataReady(true);
      }
    }

    if (syncMode !== "firebase") {
      setSyncMode("firebase");
    }

    const incomesCol = collection(db, "users", currentUserId, "incomes");
    const accountsCol = collection(db, "users", currentUserId, "accounts");
    const categoriesCol = collection(db, "users", currentUserId, "categories");
    const subcategoriesCol = collection(db, "users", currentUserId, "subcategories");
    const familyCol = collection(db, "users", currentUserId, "familyMembers");
    const transactionsCol = collection(db, "users", currentUserId, "transactions");

    const unsubscribeIncomes = onSnapshot(incomesCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

      setIncomes(docs);
      markReady("incomes");
    });

    const unsubscribeAccounts = onSnapshot(accountsCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

      setAccounts(docs);
      markReady("accounts");
    });

    const unsubscribeCategories = onSnapshot(categoriesCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

      setCategories(sortCategoriesByOrder(docs));
      markReady("categories");
    });

    const unsubscribeFamily = onSnapshot(familyCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

      setFamilyMembers(docs);
      markReady("family");
    });

    const unsubscribeSubcategories = onSnapshot(subcategoriesCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setSubcategories(docs);
      markReady("subcategories");
    });

    const unsubscribeTransactions = onSnapshot(transactionsCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setTransactions(docs);
      markReady("transactions");
    });

    return () => {
      unsubscribeIncomes();
      unsubscribeAccounts();
      unsubscribeCategories();
      unsubscribeSubcategories();
      unsubscribeFamily();
      unsubscribeTransactions();
    };
  }, [currentUserId, isAuthenticated, userEmail, syncMode]);

  const draggedAccount = useMemo(
    () => accounts.find((account) => account.id === draggedAccountId) || null,
    [accounts, draggedAccountId]
  );

  const draggedIncome = useMemo(
    () => incomes.find((income) => income.id === draggedIncomeId) || null,
    [incomes, draggedIncomeId]
  );

  const categoryTotals = useMemo(() => {
    const monthKey = currentMonthKey();
    return transactions.reduce((accumulator, transaction) => {
      if (transaction.type !== "expense" || !transaction.categoryId) return accumulator;
      if (monthKeyFromValue(transaction.createdAt) !== monthKey) return accumulator;
      const nextAmount = Number(transaction.amount || 0);
      if (!nextAmount || Number.isNaN(nextAmount)) return accumulator;
      accumulator[transaction.categoryId] = (accumulator[transaction.categoryId] || 0) + nextAmount;
      return accumulator;
    }, {});
  }, [transactions]);

  const subcategoryTotals = useMemo(() => {
    const monthKey = currentMonthKey();
    return transactions.reduce((accumulator, transaction) => {
      if (transaction.type !== "expense" || !transaction.subcategoryId) return accumulator;
      if (monthKeyFromValue(transaction.createdAt) !== monthKey) return accumulator;
      const nextAmount = Number(transaction.amount || 0);
      if (!nextAmount || Number.isNaN(nextAmount)) return accumulator;
      accumulator[transaction.subcategoryId] = (accumulator[transaction.subcategoryId] || 0) + nextAmount;
      return accumulator;
    }, {});
  }, [transactions]);

  const incomeTotals = useMemo(() => {
    const monthKey = currentMonthKey();
    return transactions.reduce((accumulator, transaction) => {
      if (transaction.type !== "income" || !transaction.sourceIncomeId) return accumulator;
      if (monthKeyFromValue(transaction.createdAt) !== monthKey) return accumulator;
      const nextAmount = Number(transaction.amount || 0);
      if (!nextAmount || Number.isNaN(nextAmount)) return accumulator;
      accumulator[transaction.sourceIncomeId] = (accumulator[transaction.sourceIncomeId] || 0) + nextAmount;
      return accumulator;
    }, {});
  }, [transactions]);

  const analyticsCategoryRows = useMemo(() => {
    const totals = transactions.reduce((accumulator, transaction) => {
      if (transaction.type !== "expense" || !transaction.categoryId) return accumulator;
      const monthKey = monthKeyFromValue(transaction.createdAt) || currentMonthKey();
      if (!isMonthInRange(monthKey, analyticsRange)) return accumulator;
      const nextAmount = Number(transaction.amount || 0);
      if (!nextAmount || Number.isNaN(nextAmount)) return accumulator;
      accumulator[transaction.categoryId] = (accumulator[transaction.categoryId] || 0) + nextAmount;
      return accumulator;
    }, {});

    const rows = Object.entries(totals)
      .map(([categoryId, amount]) => {
        const category = categories.find((item) => item.id === categoryId);
        return {
          categoryId,
          name: category?.name || "Без назви",
          color: category?.color || "#c96f55",
          amount,
        };
      })
      .sort((left, right) => right.amount - left.amount);

    const top = rows.slice(0, 6);
    const max = top[0]?.amount || 1;
    return top.map((row) => ({ ...row, percent: Math.max(8, Math.round((row.amount / max) * 100)) }));
  }, [transactions, categories, analyticsRange]);

  const analyticsMonthlyRows = useMemo(() => {
    const totals = transactions.reduce((accumulator, transaction) => {
      if (transaction.type !== "expense") return accumulator;
      const monthKey = monthKeyFromValue(transaction.createdAt) || currentMonthKey();
      if (!isMonthInRange(monthKey, analyticsRange)) return accumulator;
      const nextAmount = Number(transaction.amount || 0);
      if (!nextAmount || Number.isNaN(nextAmount)) return accumulator;
      accumulator[monthKey] = (accumulator[monthKey] || 0) + nextAmount;
      return accumulator;
    }, {});

    const entries = Object.entries(totals)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-8)
      .map(([monthKey, amount]) => ({ monthKey, amount }));

    const max = entries.reduce((value, item) => Math.max(value, item.amount), 1);
    return entries.map((item) => ({
      ...item,
      percent: Math.max(10, Math.round((item.amount / max) * 100)),
      label: item.monthKey,
    }));
  }, [transactions, analyticsRange]);

  const analyticsTotalExpense = useMemo(
    () => analyticsCategoryRows.reduce((accumulator, row) => accumulator + Number(row.amount || 0), 0),
    [analyticsCategoryRows]
  );

  const analyticsIncomeRows = useMemo(() => {
    const totals = transactions.reduce((accumulator, transaction) => {
      if (transaction.type !== "income" || !transaction.sourceIncomeId) return accumulator;
      const monthKey = monthKeyFromValue(transaction.createdAt) || currentMonthKey();
      if (!isMonthInRange(monthKey, analyticsRange)) return accumulator;
      const nextAmount = Number(transaction.amount || 0);
      if (!nextAmount || Number.isNaN(nextAmount)) return accumulator;
      accumulator[transaction.sourceIncomeId] = (accumulator[transaction.sourceIncomeId] || 0) + nextAmount;
      return accumulator;
    }, {});

    const rows = Object.entries(totals)
      .map(([incomeId, amount]) => {
        const income = incomes.find((item) => item.id === incomeId);
        return {
          incomeId,
          name: income?.name || "Джерело",
          amount,
        };
      })
      .sort((left, right) => right.amount - left.amount);

    const max = rows[0]?.amount || 1;
    return rows.slice(0, 6).map((row) => ({ ...row, percent: Math.max(8, Math.round((row.amount / max) * 100)) }));
  }, [transactions, incomes, analyticsRange]);

  const transactionJournalRows = useMemo(
    () =>
      [...transactions]
        .sort((left, right) => transactionTimestamp(right.createdAt) - transactionTimestamp(left.createdAt))
        .slice(0, 120),
    [transactions]
  );

  const userInitials = useMemo(() => buildInitials(userEmail || "Мій профіль"), [userEmail]);
  const transactionJournalBackdropAlpha = Math.max(
    0,
    0.38 * (1 - Math.min(1, transactionJournalOffsetY / 520))
  );

  useEffect(() => {
    function preventTouchDragScroll(event) {
      if (touchDragRef.current.ghost) {
        event.preventDefault();
      }
    }

    document.addEventListener("touchmove", preventTouchDragScroll, { passive: false });
    return () => {
      document.removeEventListener("touchmove", preventTouchDragScroll);
    };
  }, []);

  useEffect(() => {
    if (keypadOpen) return;
    setTransactionJournalOpen(false);
  }, [keypadOpen]);

  function openTransactionJournal() {
    if (transactionJournalCloseTimerRef.current) {
      clearTimeout(transactionJournalCloseTimerRef.current);
      transactionJournalCloseTimerRef.current = null;
    }
    const drafts = transactionJournalRows.reduce((accumulator, transaction) => {
      accumulator[transaction.id] = String(transaction.amount ?? "");
      return accumulator;
    }, {});
    setTransactionDrafts(drafts);
    setTransactionJournalClosing(false);
    setTransactionJournalOffsetY(0);
    setTransactionJournalOpen(true);
  }

  function closeTransactionJournalImmediately() {
    if (transactionJournalCloseTimerRef.current) {
      clearTimeout(transactionJournalCloseTimerRef.current);
      transactionJournalCloseTimerRef.current = null;
    }
    if (journalEditingTransactionId) {
      void handleSaveTransactionAmount(journalEditingTransactionId);
    }
    setTransactionJournalOpen(false);
    setTransactionJournalClosing(false);
    setTransactionDrafts({});
    setTransactionJournalBusyId(null);
    setTransactionSwipeOffset({});
    setTransactionSwipeDeletingId(null);
    setJournalEditingTransactionId(null);
    setTransactionJournalOffsetY(0);
    transactionJournalDragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
  }

  function requestCloseTransactionJournal() {
    if (!transactionJournalOpen || transactionJournalClosing) return;
    setTransactionJournalClosing(true);
    setTransactionJournalOffsetY(Math.max(560, Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.96)));
    transactionJournalCloseTimerRef.current = window.setTimeout(() => {
      closeTransactionJournalImmediately();
    }, 240);
  }

  function handleTransactionJournalDragStart(event) {
    if (transactionJournalCloseTimerRef.current) {
      clearTimeout(transactionJournalCloseTimerRef.current);
      transactionJournalCloseTimerRef.current = null;
    }
    setTransactionJournalClosing(false);
    setTransactionJournalDragging(true);
    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    transactionJournalDragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
  }

  function handleTransactionJournalDragMove(event) {
    const drag = transactionJournalDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = Math.max(0, event.clientY - drag.startY);
    if (Math.abs(dx) > 24 && dy < 18) return;
    setTransactionJournalOffsetY(Math.min(540, dy));
  }

  function handleTransactionJournalDragEnd(event) {
    const drag = transactionJournalDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    transactionJournalDragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
    setTransactionJournalDragging(false);
    if (transactionJournalOffsetY > 260) {
      requestCloseTransactionJournal();
      return;
    }
    setTransactionJournalOffsetY(0);
  }

  function handleDisplayPointerDown(event) {
    keypadDisplayDragRef.current = {
      active: true,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
  }

  function handleDisplayPointerUp(event) {
    const drag = keypadDisplayDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    keypadDisplayDragRef.current = { active: false, startY: 0, pointerId: null };
    const dy = event.clientY - drag.startY;
    if (dy <= -34) {
      openTransactionJournal();
    }
  }

  function handleDisplayPointerCancel() {
    keypadDisplayDragRef.current = { active: false, startY: 0, pointerId: null };
  }

  function resolveTransactionAccount(transaction) {
    if (!transaction) return null;
    return (
      accounts.find((account) => account.id === transaction.accountId) ||
      accounts.find((account) => account.name === transaction.accountName) ||
      null
    );
  }

  async function handleSaveTransactionAmount(transactionId, amountOverride = null) {
    const transaction = transactions.find((item) => item.id === transactionId);
    if (!transaction) return;

    const sourceValue = amountOverride == null ? transactionDrafts[transactionId] : amountOverride;
    const nextAmount = Number(sourceValue);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      window.alert("Введи коректну суму більше 0");
      return;
    }

    if (Math.abs(nextAmount - Number(transaction.amount || 0)) < 0.000001) {
      return;
    }

    const oldImpact = transactionAmountImpact(transaction, transaction.amount);
    const nextImpact = transactionAmountImpact(transaction, nextAmount);
    const deltaImpact = nextImpact - oldImpact;

    setTransactionJournalBusyId(transactionId);
    try {
      if (db && currentUserId) {
        const currentAccount = resolveTransactionAccount(transaction);
        if (currentAccount) {
          await updateDoc(doc(db, "users", currentUserId, "accounts", currentAccount.id), {
            balance: Number(currentAccount.balance || 0) + deltaImpact,
          });
        }

        await updateDoc(doc(db, "users", currentUserId, "transactions", transactionId), {
          amount: nextAmount,
        });
        return;
      }

      const currentAccount = resolveTransactionAccount(transaction);
      if (currentAccount) {
        setAccounts((prev) =>
          prev.map((account) => {
            if (account.id !== currentAccount.id) return account;
            return { ...account, balance: Number(account.balance || 0) + deltaImpact };
          })
        );
      }
      setTransactions((prev) =>
        prev.map((item) => (item.id === transactionId ? { ...item, amount: nextAmount } : item))
      );
    } catch {
      window.alert("Не вдалося оновити транзакцію.");
    } finally {
      setTransactionJournalBusyId(null);
    }
  }

  function startTransactionNativeEdit(transactionId) {
    const transaction = transactions.find((item) => item.id === transactionId);
    const rowElement = document.querySelector(`[data-transaction-row-id="${transactionId}"]`);
    if (rowElement) {
      rowElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    setJournalEditingTransactionId(transactionId);
    setTransactionDrafts((prev) => ({
      ...prev,
      [transactionId]: String(transaction?.amount ?? prev[transactionId] ?? "0"),
    }));
    if (journalNativeInputRef.current) {
      journalNativeInputRef.current.focus({ preventScroll: true });
      journalNativeInputRef.current.select();
    }
  }

  function handleJournalNativeInputChange(event) {
    if (!journalEditingTransactionId) return;
    setTransactionDrafts((prev) => ({ ...prev, [journalEditingTransactionId]: event.target.value }));
  }

  async function handleJournalNativeInputBlur() {
    if (!journalEditingTransactionId) return;
    const editingId = journalEditingTransactionId;
    await handleSaveTransactionAmount(editingId);
    setJournalEditingTransactionId(null);
  }

  async function handleDeleteTransaction(transactionId, requireConfirm = true) {
    const transaction = transactions.find((item) => item.id === transactionId);
    if (!transaction) return;
    if (requireConfirm && !window.confirm("Видалити цю транзакцію?")) return;

    const impact = transactionAmountImpact(transaction, transaction.amount);
    setTransactionJournalBusyId(transactionId);
    try {
      if (db && currentUserId) {
        const currentAccount = resolveTransactionAccount(transaction);
        if (currentAccount) {
          await updateDoc(doc(db, "users", currentUserId, "accounts", currentAccount.id), {
            balance: Number(currentAccount.balance || 0) - impact,
          });
        }

        await deleteDoc(doc(db, "users", currentUserId, "transactions", transactionId));
        return;
      }

      const currentAccount = resolveTransactionAccount(transaction);
      if (currentAccount) {
        setAccounts((prev) =>
          prev.map((account) => {
            if (account.id !== currentAccount.id) return account;
            return { ...account, balance: Number(account.balance || 0) - impact };
          })
        );
      }
      setTransactions((prev) => prev.filter((item) => item.id !== transactionId));
    } catch {
      window.alert("Не вдалося видалити транзакцію.");
    } finally {
      setTransactionJournalBusyId(null);
    }
  }

  function handleTransactionRowPointerDown(transactionId, event) {
    if (transactionJournalBusyId) return;
    transactionSwipeRef.current = {
      id: transactionId,
      startX: event.clientX,
      pointerId: event.pointerId,
      active: true,
      moved: false,
    };
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handleTransactionRowPointerMove(transactionId, event) {
    const swipe = transactionSwipeRef.current;
    if (!swipe.active || swipe.id !== transactionId || swipe.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipe.startX;
    if (Math.abs(dx) > 6) {
      swipe.moved = true;
    }
    const clamped = Math.max(-132, Math.min(0, dx));
    setTransactionSwipeOffset((prev) => ({ ...prev, [transactionId]: clamped }));
  }

  function resetTransactionSwipe(transactionId) {
    setTransactionSwipeOffset((prev) => ({ ...prev, [transactionId]: 0 }));
    transactionSwipeRef.current = { id: null, startX: 0, pointerId: null, active: false };
  }

  function handleTransactionRowPointerUp(transactionId, event) {
    const swipe = transactionSwipeRef.current;
    if (!swipe.active || swipe.id !== transactionId || swipe.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipe.startX;
    const currentTarget = event.currentTarget;
    if (dx <= -84) {
      if (!window.confirm("Видалити цю транзакцію?")) {
        resetTransactionSwipe(transactionId);
        return;
      }
      setTransactionSwipeDeletingId(transactionId);
      setTransactionSwipeOffset((prev) => ({ ...prev, [transactionId]: -164 }));
      transactionSwipeRef.current = { id: null, startX: 0, pointerId: null, active: false };
      window.setTimeout(() => {
        void handleDeleteTransaction(transactionId, false);
      }, 140);
      return;
    }

    if (!swipe.moved && Math.abs(dx) < 6) {
      if (currentTarget.releasePointerCapture) {
        try {
          currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // ignore release errors
        }
      }
      startTransactionNativeEdit(transactionId);
    }

    resetTransactionSwipe(transactionId);
  }

  function handleTransactionRowPointerCancel(transactionId) {
    resetTransactionSwipe(transactionId);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");

    if (!auth) {
      setAuthResolved(true);
      setIsAuthenticated(true);
      setCurrentUserId("local-user");
      setUserEmail(authEmail);
      return;
    }

    setAuthBusy(true);

    try {
      if (authMode === "register") {
        const result = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        setUserEmail(result.user.email || "");
      } else {
        const result = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        setUserEmail(result.user.email || "");
      }
    } catch (error) {
      const code = error?.code || "auth/unknown";
      const readable = code.replace("auth/", "").replaceAll("-", " ");
      setAuthError(`Помилка авторизації: ${readable}.`);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    if (auth) {
      await signOut(auth);
      return;
    }

    setIsAuthenticated(false);
    setCurrentUserId("");
    setUserEmail("");
    setFamilyMembers([]);
    setFirebaseDataReady(true);
  }

  async function handleDeleteIncome(id) {
    if (db && currentUserId) {
      try {
        await deleteDoc(doc(db, "users", currentUserId, "incomes", id));
        return;
      } catch {
        window.alert("Не вдалося видалити дохід у Firebase.");
        return;
      }
    }
    setIncomes((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleDeleteAccount(id) {
    const relatedTransactions = transactions.filter((item) => item.accountId === id);

    if (db && currentUserId) {
      try {
        await Promise.all(
          relatedTransactions.map((item) => deleteDoc(doc(db, "users", currentUserId, "transactions", item.id)))
        );
        await deleteDoc(doc(db, "users", currentUserId, "accounts", id));
        return;
      } catch {
        window.alert("Не вдалося видалити рахунок у Firebase.");
        return;
      }
    }
    setTransactions((prev) => prev.filter((item) => item.accountId !== id));
    setAccounts((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleDeleteSubcategory(subcategoryId) {
    if (db && currentUserId) {
      try {
        await deleteDoc(doc(db, "users", currentUserId, "subcategories", subcategoryId));
        return;
      } catch {
        window.alert("Не вдалося видалити підкатегорію у Firebase.");
        return;
      }
    }
    setSubcategories((prev) => prev.filter((item) => item.id !== subcategoryId));
  }

  async function handleDeleteCategory(categoryId) {
    const linkedSubcategories = subcategories.filter((item) => item.parentCategoryId === categoryId);
    const linkedSubcategoryIds = new Set(linkedSubcategories.map((item) => item.id));
    const relatedTransactions = transactions.filter(
      (item) => item.categoryId === categoryId || (item.subcategoryId && linkedSubcategoryIds.has(item.subcategoryId))
    );

    if (db && currentUserId) {
      try {
        await Promise.all(
          relatedTransactions.map((item) => deleteDoc(doc(db, "users", currentUserId, "transactions", item.id)))
        );
        await Promise.all(
          linkedSubcategories.map((item) => deleteDoc(doc(db, "users", currentUserId, "subcategories", item.id)))
        );
        await deleteDoc(doc(db, "users", currentUserId, "categories", categoryId));
        return;
      } catch {
        window.alert("Не вдалося видалити категорію у Firebase.");
        return;
      }
    }

    setTransactions((prev) =>
      prev.filter((item) => item.categoryId !== categoryId && !(item.subcategoryId && linkedSubcategoryIds.has(item.subcategoryId)))
    );
    setSubcategories((prev) => prev.filter((item) => item.parentCategoryId !== categoryId));
    setCategories((prev) => prev.filter((item) => item.id !== categoryId));
  }

  async function handleAddFamilyMember() {
    const email = window.prompt("Email члена сім'ї");
    if (!email) return;

    const displayName = window.prompt("Ім'я (необов'язково)") || email.replace(/@.*/, "");

    if (db && currentUserId) {
      await addDoc(collection(db, "users", currentUserId, "familyMembers"), {
        email,
        displayName,
        role: "member",
        createdAt: serverTimestamp(),
      });
      return;
    }

    setFamilyMembers((prev) => [
      ...prev,
      { id: `local-family-${Date.now()}`, email, displayName, role: "member" },
    ]);
  }

  function openCreateItemEditor(type) {
    setItemEditor({
      type,
      id: null,
      name: "",
      balance: type === "account" ? "0" : "",
    });
    setItemMenu(null);
  }

  function openEditItemEditor(type, item) {
    if (!item) return;
    setItemEditor({
      type,
      id: item.id,
      name: item.name || "",
      balance: type === "account" ? String(item.balance ?? 0) : "",
    });
    setItemMenu(null);
  }

  function closeItemEditor() {
    setItemEditor(null);
  }

  async function saveItemEditor() {
    if (!itemEditor) return;
    const name = String(itemEditor.name || "").trim();
    if (!name) return;

    if (itemEditor.type === "account") {
      const balance = Number(itemEditor.balance || 0);
      if (!itemEditor.id) {
        if (db && currentUserId) {
          try {
            await addDoc(collection(db, "users", currentUserId, "accounts"), {
              name,
              balance: Number.isFinite(balance) ? balance : 0,
              type: "custom",
              createdAt: serverTimestamp(),
            });
          } catch {
            window.alert("Не вдалося записати рахунок у Firebase. Перевір правила Firestore.");
            return;
          }
        } else {
          setAccounts((prev) => [
            ...prev,
            {
              id: `acc-${Date.now()}`,
              name,
              balance: Number.isFinite(balance) ? balance : 0,
              type: "custom",
            },
          ]);
        }
      } else if (db && currentUserId) {
        try {
          await updateDoc(doc(db, "users", currentUserId, "accounts", itemEditor.id), {
            name,
            balance: Number.isFinite(balance) ? balance : 0,
          });
        } catch {
          window.alert("Не вдалося оновити рахунок у Firebase.");
          return;
        }
      } else {
        setAccounts((prev) =>
          prev.map((item) =>
            item.id === itemEditor.id ? { ...item, name, balance: Number.isFinite(balance) ? balance : 0 } : item
          )
        );
      }
    }

    if (itemEditor.type === "income") {
      if (!itemEditor.id) {
        if (db && currentUserId) {
          try {
            await addDoc(collection(db, "users", currentUserId, "incomes"), {
              name,
              amount: 0,
              createdAt: serverTimestamp(),
            });
          } catch {
            window.alert("Не вдалося записати джерело доходу у Firebase. Перевір правила Firestore.");
            return;
          }
        } else {
          setIncomes((prev) => [...prev, { id: `inc-${Date.now()}`, name, amount: 0 }]);
        }
      } else if (db && currentUserId) {
        try {
          await updateDoc(doc(db, "users", currentUserId, "incomes", itemEditor.id), { name });
        } catch {
          window.alert("Не вдалося оновити джерело доходу у Firebase.");
          return;
        }
      } else {
        setIncomes((prev) => prev.map((item) => (item.id === itemEditor.id ? { ...item, name } : item)));
      }
    }

    setItemEditor(null);
  }

  function openSubcategoryEditor(category) {
    if (!category) return;
    setSubcategoryEditorOffsetY(0);
    setSubcategoryEditor({
      categoryId: category.id,
      categoryName: category.name || "Категорія",
      draftName: "",
      draftIcon: "",
    });
  }

  async function closeSubcategoryEditor() {
    const editor = subcategoryEditor;
    if (editor?.categoryId) {
      const itemsToPersist = subcategories.filter((item) => item.parentCategoryId === editor.categoryId);
      await Promise.all(itemsToPersist.map((item) => handleRenameSubcategory(item.id, item.name, item.icon)));
    }
    setSubcategoryEditorOffsetY(0);
    subcategoryEditorDragRef.current = { active: false, startY: 0, pointerId: null };
    setSubcategoryEditor(null);
  }

  function handleSubcategoryEditorDragStart(event) {
    if (!subcategoryEditor) return;
    subcategoryEditorDragRef.current = {
      active: true,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
  }

  function handleSubcategoryEditorDragMove(event) {
    const drag = subcategoryEditorDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - drag.startY);
    setSubcategoryEditorOffsetY(Math.min(240, dy));
  }

  function handleSubcategoryEditorDragEnd(event) {
    const drag = subcategoryEditorDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    subcategoryEditorDragRef.current = { active: false, startY: 0, pointerId: null };
    if (subcategoryEditorOffsetY > 90) {
      void closeSubcategoryEditor();
      return;
    }
    setSubcategoryEditorOffsetY(0);
  }

  async function handleAddSubcategory(categoryId, draftName, draftIcon) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    const existing = subcategories.filter((s) => s.parentCategoryId === category.id);
    if (existing.length >= 5) {
      window.alert(`Максимум 5 підкатегорій для "${category.name}"`);
      return;
    }

    const name = String(draftName || "").trim();
    if (!name) return;
    const draft = {
      name,
      icon: String(draftIcon || "").trim() || buildInitials(name),
      parentCategoryId: category.id,
    };

    if (db && currentUserId) {
      try {
        await addDoc(collection(db, "users", currentUserId, "subcategories"), {
          ...draft,
          createdAt: serverTimestamp(),
        });
      } catch {
        window.alert("Не вдалося записати підкатегорію у Firebase. Перевір правила Firestore.");
        return;
      }
    } else {
      setSubcategories((prev) => [...prev, { id: `sub-${Date.now()}`, ...draft }]);
    }

    setSubcategoryEditor((prev) => {
      if (!prev || prev.categoryId !== category.id) return prev;
      return { ...prev, draftName: "", draftIcon: "" };
    });
  }

  async function handleRenameSubcategory(subcategoryId, name, icon) {
    const payload = {
      name: String(name || "").trim() || "Підкатегорія",
      icon: String(icon || "").trim() || buildInitials(name || "Підкатегорія"),
    };

    if (db && currentUserId) {
      try {
        await updateDoc(doc(db, "users", currentUserId, "subcategories", subcategoryId), payload);
      } catch {
        window.alert("Не вдалося оновити підкатегорію у Firebase.");
      }
      return;
    }

    setSubcategories((prev) => prev.map((item) => (item.id === subcategoryId ? { ...item, ...payload } : item)));
  }

  function updateSubcategoryDraft(subcategoryId, field, value) {
    setSubcategories((prev) => prev.map((item) => (item.id === subcategoryId ? { ...item, [field]: value } : item)));
  }

  const subcategoryEditorItems = useMemo(() => {
    if (!subcategoryEditor?.categoryId) return [];
    return subcategories.filter((item) => item.parentCategoryId === subcategoryEditor.categoryId);
  }, [subcategories, subcategoryEditor]);

  const subcategoryLimitReached = subcategoryEditorItems.length >= 5;

  useEffect(() => {
    if (!categoryEditor) return;
    if (!categoryEditor.id) return;
    if (categoryEditorSaveTimerRef.current) {
      clearTimeout(categoryEditorSaveTimerRef.current);
    }
    categoryEditorSaveTimerRef.current = setTimeout(() => {
      void persistCategoryEditorDraft(categoryEditor);
    }, 260);

    return () => {
      if (categoryEditorSaveTimerRef.current) {
        clearTimeout(categoryEditorSaveTimerRef.current);
        categoryEditorSaveTimerRef.current = null;
      }
    };
  }, [categoryEditor]);

  function handleDropOnCategory(category, accountFromTouch = null) {
    const sourceAccount = accountFromTouch || draggedAccount;
    if (!sourceAccount) return;
    triggerHaptic(22);
    setHoveredDropCategoryId(null);
    setHoveredDropSubcategoryId(null);
    setTarget({ account: sourceAccount, category });
    setEntry("0");
    setKeypadOpen(true);
    setDraggedAccountId(null);
    setActiveExpenseDropId(null);
  }

  function handleDropOnSubcategory(category, subcategory, accountFromTouch = null) {
    const sourceAccount = accountFromTouch || draggedAccount;
    if (!sourceAccount) return;
    triggerHaptic(22);
    setHoveredDropCategoryId(null);
    setHoveredDropSubcategoryId(null);
    setTarget({ account: sourceAccount, category, subcategory });
    setEntry("0");
    setKeypadOpen(true);
    setDraggedAccountId(null);
    setActiveExpenseDropId(null);
  }

  async function handleDropIncomeOnAccount(account, incomeFromTouch = null) {
    const sourceIncome = incomeFromTouch || draggedIncome;
    if (!sourceIncome) return;
    triggerHaptic(22);
    setHoveredDropCategoryId(null);
    setHoveredDropSubcategoryId(null);
    setTarget({ mode: "income", account, income: sourceIncome });
    setEntry("0");
    setKeypadOpen(true);
    setDraggedIncomeId(null);
  }

  function handleCategoryTouchStart(category, event) {
    if (categoryEditMode) {
      event.preventDefault();
      const touch = event.touches?.[0];
      if (!touch) return;
      categoryReorderRef.current = {
        ghost: null,
        sourceId: category.id,
        overId: category.id,
        moved: false,
        startX: touch.clientX,
        startY: touch.clientY,
        previewItems: sortCategoriesByOrder(categories),
      };
      return;
    }

    if (draggedAccountId || draggedIncomeId) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.top + rect.height / 2;

    categoryPressRef.current.startX = touch.clientX;
    categoryPressRef.current.startY = touch.clientY;
    categoryPressRef.current.fired = false;
    if (categoryPressRef.current.timer) {
      clearTimeout(categoryPressRef.current.timer);
    }

    categoryPressRef.current.timer = setTimeout(() => {
      categoryPressRef.current.fired = true;
      triggerHaptic([18, 24, 18]);
      setCategoryEditMode(true);
    }, 480);
  }

  function handleCategoryTouchMove(event) {
    if (categoryEditMode) {
      const touch = event.touches?.[0];
      const drag = categoryReorderRef.current;
      if (!touch || !drag.sourceId) return;
      const dx = touch.clientX - drag.startX;
      const dy = touch.clientY - drag.startY;
      if (!drag.moved && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        drag.moved = true;
        const circle = document
          .querySelector(`[data-reorder-category="${drag.sourceId}"] .alba-item-circle`);
        const rect = circle?.getBoundingClientRect();
        if (circle && rect) {
          const ghost = circle.cloneNode(true);
          ghost.className = `${circle.className} alba-drag-ghost alba-drag-ghost-category`;
          ghost.style.width = `${rect.width}px`;
          ghost.style.height = `${rect.height}px`;
          ghost.style.left = `${touch.clientX - rect.width / 2}px`;
          ghost.style.top = `${touch.clientY - rect.height / 2}px`;
          document.body.appendChild(ghost);
          drag.ghost = ghost;
        }
        setDraggedCategoryId(drag.sourceId);
      }
      event.preventDefault();
      if (drag.ghost) {
        drag.ghost.style.left = `${touch.clientX - drag.ghost.offsetWidth / 2}px`;
        drag.ghost.style.top = `${touch.clientY - drag.ghost.offsetHeight / 2}px`;
      }
      const hovered = document.elementFromPoint(touch.clientX, touch.clientY);
      const targetCategory = hovered?.closest("[data-reorder-category]");
      const nextOverId = targetCategory ? targetCategory.getAttribute("data-reorder-category") : drag.overId;
      if (nextOverId && nextOverId !== drag.overId) {
        drag.overId = nextOverId;
        drag.previewItems = previewCategoryOrder(drag.sourceId, nextOverId, drag.previewItems);
      }
      return;
    }

    const touch = event.touches?.[0];
    if (!touch || !categoryPressRef.current.timer) return;
    const dx = Math.abs(touch.clientX - categoryPressRef.current.startX);
    const dy = Math.abs(touch.clientY - categoryPressRef.current.startY);
    if (dx > 10 || dy > 10) {
      clearTimeout(categoryPressRef.current.timer);
      categoryPressRef.current.timer = null;
    }
  }

  function handleCategoryTouchEnd(event) {
    if (categoryEditMode) {
      const drag = categoryReorderRef.current;
      if (drag.ghost) {
        drag.ghost.remove();
      }
      if (drag.sourceId && drag.moved && drag.previewItems.length) {
        persistCategoryOrder(drag.previewItems);
      } else if (drag.sourceId) {
        openCategoryMenu(drag.sourceId);
      }
      setDraggedCategoryId(null);
      categoryReorderRef.current = {
        ghost: null,
        sourceId: null,
        overId: null,
        moved: false,
        startX: 0,
        startY: 0,
        previewItems: [],
      };
      event.preventDefault();
      return;
    }

    if (categoryPressRef.current.timer) {
      clearTimeout(categoryPressRef.current.timer);
      categoryPressRef.current.timer = null;
    }
    if (categoryPressRef.current.fired) {
      event.preventDefault();
    }
  }

  function pushDigit(value) {
    setEntry((prev) => {
      if (value === ".") {
        if (prev.includes(".")) return prev;
        return `${prev}.`;
      }

      if (prev === "0") return value;
      return `${prev}${value}`;
    });
  }

  function backspace() {
    setEntry((prev) => {
      if (prev.length <= 1) return "0";
      return prev.slice(0, -1);
    });
  }

  function clearEntry() {
    setEntry("0");
  }

  async function confirmExpense() {
    const amount = Number(entry);
    if (!target) return;
    if (Number.isNaN(amount) || amount <= 0) {
      window.alert("Введи коректну суму більше 0");
      return;
    }

    if (target.mode === "income") {
      if (db && currentUserId) {
        try {
          const currentAccount = accounts.find((account) => account.id === target.account.id);
          if (!currentAccount) return;
          const nextBalance = Number(currentAccount.balance || 0) + amount;

          await updateDoc(doc(db, "users", currentUserId, "accounts", target.account.id), {
            balance: nextBalance,
          });

          await addDoc(collection(db, "users", currentUserId, "transactions"), {
            accountId: target.account.id,
            accountName: target.account.name,
            categoryId: null,
            categoryName: "Дохід",
            amount,
            type: "income",
            sourceIncomeId: target.income.id,
            sourceIncomeName: target.income.name,
            createdAt: serverTimestamp(),
          });

          setKeypadOpen(false);
          setTarget(null);
          setEntry("0");
          return;
        } catch {
          window.alert("Не вдалося зарахувати дохід у Firebase. Операцію скасовано.");
          return;
        }
      }

      setAccounts((prev) =>
        prev.map((item) => {
          if (item.id !== target.account.id) return item;
          return { ...item, balance: Number(item.balance || 0) + amount };
        })
      );

      setTransactions((prev) => [
        ...prev,
        {
          id: `txn-${Date.now()}`,
          accountId: target.account.id,
          accountName: target.account.name,
          categoryId: null,
          categoryName: "Дохід",
          amount,
          type: "income",
          sourceIncomeId: target.income.id,
          sourceIncomeName: target.income.name,
          createdAt: new Date().toISOString(),
        },
      ]);

      setKeypadOpen(false);
      setTarget(null);
      setEntry("0");
      return;
    }

    if (db && currentUserId) {
      try {
        const currentAccount = accounts.find((account) => account.id === target.account.id);
        if (!currentAccount) return;

        const nextBalance = Number(currentAccount.balance || 0) - amount;

        await updateDoc(doc(db, "users", currentUserId, "accounts", target.account.id), {
          balance: nextBalance,
        });

        await addDoc(collection(db, "users", currentUserId, "transactions"), {
          accountId: target.account.id,
          accountName: currentAccount.name,
          categoryId: target.category.id,
          categoryName: target.category.name,
          subcategoryId: target.subcategory?.id || null,
          subcategoryName: target.subcategory?.name || null,
          amount,
          type: "expense",
          createdAt: serverTimestamp(),
        });

        setKeypadOpen(false);
        setTarget(null);
        setEntry("0");
        return;
      } catch (error) {
        window.alert("Не вдалося зберегти витрату у Firebase. Операцію скасовано.");
        return;
      }
    }

    setAccounts((prev) =>
      prev.map((account) => {
        if (account.id !== target.account.id) return account;
        return { ...account, balance: Number(account.balance || 0) - amount };
      })
    );

    setTransactions((prev) => [
      ...prev,
      {
        id: `txn-${Date.now()}`,
        accountId: target.account.id,
        accountName: target.account.name,
        categoryId: target.category.id,
        categoryName: target.category.name,
        subcategoryId: target.subcategory?.id || null,
        subcategoryName: target.subcategory?.name || null,
        amount,
        type: "expense",
        createdAt: new Date().toISOString(),
      },
    ]);

    setKeypadOpen(false);
    setTarget(null);
    setEntry("0");
  }

  const shouldShowBootstrapScreen = !authResolved || (Boolean(db) && isAuthenticated && !firebaseDataReady);

  if (shouldShowBootstrapScreen) {
    return (
      <div className="alba-shell">
        <div className="alba-glow alba-glow-a" />
        <div className="alba-glow alba-glow-b" />

        <div className="alba-auth-card">
          <p className="alba-label">ALBA</p>
          <h1>Завантаження профілю...</h1>
          <p className="alba-subtle">Синхронізуємо категорії, підкатегорії та баланси.</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="alba-shell">
        <div className="alba-glow alba-glow-a" />
        <div className="alba-glow alba-glow-b" />

        <div className="alba-auth-card">
          <p className="alba-label">ALBA</p>
          <h1>Особисті та сімейні фінанси в одному місці</h1>
          <p className="alba-subtle">
            Відстежуйте баланси рахунків, перетягуйте кошти у категорії витрат і синхронізуйте сімейний бюджет.
          </p>

          <div className="alba-auth-toggle" role="tablist" aria-label="Режим авторизації">
            <button
              type="button"
              className={authMode === "login" ? "is-active" : ""}
              onClick={() => setAuthMode("login")}
            >
              Увійти
            </button>
            <button
              type="button"
              className={authMode === "register" ? "is-active" : ""}
              onClick={() => setAuthMode("register")}
            >
              Реєстрація
            </button>
          </div>

          <form className="alba-auth-form" onSubmit={handleAuthSubmit}>
            <label>
              <span>Електронна пошта</span>
              <input
                type="email"
                placeholder="you@alba.app"
                required
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
              />
            </label>
            <label>
              <span>Пароль</span>
              <input
                type="password"
                placeholder="Мінімум 8 символів"
                required
                minLength={8}
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
              />
            </label>
            {authMode === "register" ? (
              <label>
                <span>Код сім'ї (необов'язково)</span>
                <input type="text" placeholder="ALBA-HOME" />
              </label>
            ) : null}
            {authError ? <p className="alba-auth-error">{authError}</p> : null}
            <button className="alba-primary" type="submit" disabled={authBusy}>
              {authMode === "login" ? "Продовжити" : "Створити акаунт"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`alba-shell ${activeExpenseDropId ? "is-subcat-focus" : ""} ${activeTab !== "home" ? "is-scrollable" : ""}`}>
      <div className="alba-glow alba-glow-a" />
      <div className="alba-glow alba-glow-b" />

      <div className="alba-app">
        <header className="alba-header">
          <div className="alba-profile-group">
            <button
              className={`alba-avatar ${syncMode === "firebase" ? "is-online" : "is-local"}`}
              type="button"
              aria-label="Мій профіль"
            >
              {userInitials}
            </button>

            <div className="alba-family-strip" aria-label="Сім'я">
              {familyMembers
                .filter((member) => member.id !== currentUserId)
                .map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="alba-member-pill"
                  aria-label={`Учасник: ${member.displayName || member.email || "Без імені"}`}
                >
                  {buildInitials(member.displayName || member.email || "У")}
                </button>
                ))}
              <button
                type="button"
                className="alba-member-pill alba-plus"
                aria-label="Додати члена сім'ї"
                onClick={handleAddFamilyMember}
              >
                +
              </button>
            </div>
          </div>

          <div className="alba-header-right">
            <div className="alba-logo" aria-label="Логотип ALBA">
              ALBA
            </div>
            <button type="button" className="alba-logout" onClick={handleLogout}>
              Вийти
            </button>
          </div>
        </header>

        <main className="alba-main">
          {activeTab === "home" ? (
            <>
              <section className={`alba-section alba-section-incomes ${isIncomesOpen ? "" : "is-collapsed"}`}>
            <div className="alba-section-head">
              <h2>Доходи</h2>
              <div
                role="button"
                tabIndex={0}
                className={`alba-section-toggle ${isIncomesOpen ? "is-open" : ""}`}
                onClick={() => setIsIncomesOpen((prev) => !prev)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setIsIncomesOpen((prev) => !prev);
                  }
                }}
                aria-expanded={isIncomesOpen}
                aria-controls="alba-incomes-grid"
                aria-label={isIncomesOpen ? "Сховати доходи" : "Показати доходи"}
              >
                <svg className="alba-section-toggle-arrow" viewBox="0 0 12 8" aria-hidden="true">
                  <path d="M1 1L6 6L11 1" />
                </svg>
              </div>
            </div>
            {isIncomesOpen ? (
              <>
                <div id="alba-incomes-grid" className="alba-accounts-grid">
                  {incomes.map((income) => (
                    <article
                      key={income.id}
                      className="alba-income-card alba-item-card"
                      draggable
                      onDragStart={() => {
                        setDraggedIncomeId(income.id);
                        setDraggedAccountId(null);
                      }}
                      onDragEnd={() => setDraggedIncomeId(null)}
                      onTouchStart={(e) => handleTouchStart("income", income, e)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      aria-label={`Дохід ${income.name}, сума ${money(income.amount)}`}
                    >
                      <div className="alba-item-circle is-income" aria-hidden="true">
                        ₴
                      </div>
                      <p className="alba-item-title">{income.name}</p>
                      <span className="alba-item-subtitle">{money(incomeTotals[income.id] || 0)}</span>
                    </article>
                  ))}
                  <button
                    type="button"
                    className="alba-item-card alba-item-add"
                    onClick={() => openCreateItemEditor("income")}
                    aria-label="Додати дохід"
                  >
                    <div className="alba-item-circle is-add" aria-hidden="true">
                      +
                    </div>
                    <span className="alba-item-title">Додати</span>
                  </button>
                </div>
                <div className="alba-inline-divider" aria-hidden="true" />
              </>
            ) : (
              <div className="alba-inline-divider alba-inline-divider-collapsed" aria-hidden="true" />
            )}
              </section>

              <section className={`alba-section alba-section-with-divider ${isAccountsOpen ? "" : "is-collapsed"}`}>
            <div className="alba-section-head">
              <h2>Рахунки</h2>
              <div
                role="button"
                tabIndex={0}
                className={`alba-section-toggle ${isAccountsOpen ? "is-open" : ""}`}
                onClick={() => setIsAccountsOpen((prev) => !prev)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setIsAccountsOpen((prev) => !prev);
                  }
                }}
                aria-expanded={isAccountsOpen}
                aria-controls="alba-accounts-grid"
                aria-label={isAccountsOpen ? "Сховати рахунки" : "Показати рахунки"}
              >
                <svg className="alba-section-toggle-arrow" viewBox="0 0 12 8" aria-hidden="true">
                  <path d="M1 1L6 6L11 1" />
                </svg>
              </div>
            </div>
            {isAccountsOpen ? (
              <div id="alba-accounts-grid" className="alba-accounts-grid">
                {accounts.map((account) => (
                  <article
                    key={account.id}
                    className="alba-account-card alba-item-card"
                    draggable
                    data-drop-account={account.id}
                    onDragStart={() => {
                      setDraggedAccountId(account.id);
                      setDraggedIncomeId(null);
                      setActiveExpenseDropId(null);
                    }}
                    onDragEnd={() => {
                      setDraggedAccountId(null);
                      setActiveExpenseDropId(null);
                    }}
                    onDragOver={(event) => {
                      if (draggedIncome) event.preventDefault();
                    }}
                    onDrop={() => handleDropIncomeOnAccount(account)}
                    onTouchStart={(e) => handleTouchStart("account", account, e)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    aria-label={`Рахунок ${account.name}, баланс ${money(account.balance)}`}
                  >
                    <div className="alba-item-circle is-account" aria-hidden="true">
                      {buildInitials(account.name)}
                    </div>
                    <p className="alba-item-title">{account.name}</p>
                    <span className={`alba-item-subtitle ${Number(account.balance || 0) < 0 ? "is-negative" : ""}`}>
                      {money(account.balance)}
                    </span>
                  </article>
                ))}
                <button
                  type="button"
                  className="alba-item-card alba-item-add"
                  onClick={() => openCreateItemEditor("account")}
                  aria-label="Додати рахунок"
                >
                  <div className="alba-item-circle is-add" aria-hidden="true">
                    +
                  </div>
                  <span className="alba-item-title">Додати</span>
                </button>
              </div>
            ) : null}
              </section>

              <section className={`alba-section ${isExpensesOpen ? "" : "is-collapsed"}`}>
            <div className="alba-section-head">
              <h2>Витрати</h2>
              <div
                role="button"
                tabIndex={0}
                className={`alba-section-toggle ${isExpensesOpen ? "is-open" : ""}`}
                onClick={() => setIsExpensesOpen((prev) => !prev)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setIsExpensesOpen((prev) => !prev);
                  }
                }}
                aria-expanded={isExpensesOpen}
                aria-controls="alba-expenses-grid"
                aria-label={isExpensesOpen ? "Сховати витрати" : "Показати витрати"}
              >
                <svg className="alba-section-toggle-arrow" viewBox="0 0 12 8" aria-hidden="true">
                  <path d="M1 1L6 6L11 1" />
                </svg>
              </div>
            </div>
            {isExpensesOpen ? (
              <div id="alba-expenses-grid" className="alba-category-grid">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className={`alba-category-wrap ${categoryEditMode ? "is-editing" : ""} ${draggedCategoryId === category.id ? "is-dragging" : ""} ${activeExpenseDropId === category.id ? "is-subcat-focus" : ""} ${hoveredDropCategoryId === category.id ? "is-drop-hover" : ""} ${draggedAccountId && activeExpenseDropId === category.id ? "is-parent-drop-active" : ""}`}
                    data-expense-category={category.id}
                    data-reorder-category={category.id}
                    style={{ opacity: activeExpenseDropId && activeExpenseDropId !== category.id ? 0.18 : 1, zIndex: activeExpenseDropId === category.id ? 72 : undefined }}
                  >
                    <button
                      type="button"
                      className="alba-category-card alba-item-card"
                      draggable={categoryEditMode}
                      data-drop-category={category.id}
                      data-expense-category={category.id}
                      onClick={() => {
                        if (!categoryEditMode) return;
                        openCategoryMenu(category.id);
                      }}
                      onDragStart={(event) => {
                        if (!categoryEditMode) {
                          event.preventDefault();
                          return;
                        }
                        setDraggedCategoryId(category.id);
                        event.dataTransfer.effectAllowed = "move";
                        if (transparentDragImageRef.current) {
                          event.dataTransfer.setDragImage(transparentDragImageRef.current, 0, 0);
                        }
                      }}
                      onDragEnd={() => setDraggedCategoryId(null)}
                      onDragEnter={(event) => {
                        if (categoryEditMode) return;
                        if (draggedAccountId) {
                          const canExpand = hasSubcategoriesForCategory(category.id);
                          setActiveExpenseDropId(canExpand ? category.id : null);
                          setHoveredDropCategoryId(category.id);
                          setHoveredDropSubcategoryId(null);
                          if (canExpand) {
                            const r = event.currentTarget.getBoundingClientRect();
                            setSubcatAnchor({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                          }
                        }
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (categoryEditMode) return;
                        if (draggedAccountId) {
                          const canExpand = hasSubcategoriesForCategory(category.id);
                          setActiveExpenseDropId(canExpand ? category.id : null);
                          setHoveredDropCategoryId(category.id);
                          setHoveredDropSubcategoryId(null);
                        }
                      }}
                      onDrop={() => {
                        if (categoryEditMode) {
                          reorderCategories(draggedCategoryId, category.id);
                          setDraggedCategoryId(null);
                          return;
                        }
                        handleDropOnCategory(category);
                      }}
                      onTouchStart={(event) => handleCategoryTouchStart(category, event)}
                      onTouchMove={handleCategoryTouchMove}
                      onTouchEnd={handleCategoryTouchEnd}
                      aria-label={`Категорія витрат ${category.name}`}
                    >
                      <div className="alba-item-circle is-category" style={buildCategoryCircleStyle(category.color)} aria-hidden="true">
                        {category.icon}
                      </div>
                      <span className="alba-item-title">{category.name}</span>
                      <span className="alba-item-subtitle">{money(categoryTotals[category.id] || 0)}</span>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="alba-item-card alba-category-card alba-item-add"
                  onClick={openCreateCategoryEditor}
                  aria-label="Додати категорію"
                >
                  <div className="alba-item-circle is-add" aria-hidden="true">
                    +
                  </div>
                  <span className="alba-item-title">Додати</span>
                </button>
              </div>
            ) : null}
              </section>
            </>
          ) : null}

          {activeTab === "analytics" ? (
            <Suspense
              fallback={
                <section className="alba-analytics">
                  <article className="alba-analytics-card">
                    <p className="alba-label">Аналітика</p>
                    <h3>Завантаження графіків...</h3>
                  </article>
                </section>
              }
            >
              <AlbaAnalytics
                analyticsCategoryRows={analyticsCategoryRows}
                analyticsIncomeRows={analyticsIncomeRows}
                analyticsMonthlyRows={analyticsMonthlyRows}
                analyticsRange={analyticsRange}
                onChangeRange={setAnalyticsRange}
                totalExpense={analyticsTotalExpense}
                money={money}
                transactions={transactions}
              />
            </Suspense>
          ) : null}

          {activeTab === "family" ? (
            <section className="alba-analytics">
              <article className="alba-analytics-card">
                <p className="alba-label">Сім&apos;я</p>
                <h3>Учасники</h3>
                <p className="alba-subtle">Тут будуть сімейні ролі, запрошення та спільні ліміти.</p>
              </article>
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <section className="alba-analytics">
              <article className="alba-analytics-card">
                <p className="alba-label">Налаштування</p>
                <h3>Параметри профілю</h3>
                <p className="alba-subtle">Налаштування синхронізації, теми і локальних даних.</p>
              </article>
            </section>
          ) : null}
        </main>

        <nav className="alba-bottom-nav" aria-label="Головна навігація">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "is-active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="alba-nav-icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="alba-nav-label">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {keypadOpen && target ? (
        <div className="alba-keypad-overlay" role="dialog" aria-modal="true" aria-label="Введення суми">
          <div className="alba-keypad-panel">
            <h3>
              {target.mode === "income"
                ? `${target.income.name} -> ${target.account.name}`
                : `${target.account.name} до ${target.category.name}${target.subcategory ? ` / ${target.subcategory.name}` : ""}`}
            </h3>
            <div className="alba-keypad-actions">
              <button type="button" onClick={clearEntry}>
                Очистити
              </button>
              <button
                type="button"
                onClick={() => {
                  setKeypadOpen(false);
                  setTarget(null);
                  setEntry("0");
                }}
              >
                Скасувати
              </button>
              <button type="button" className="alba-primary" onClick={confirmExpense}>
                Зберегти
              </button>
            </div>
            <div
              className="alba-display alba-display-with-journal"
              onPointerDown={handleDisplayPointerDown}
              onPointerUp={handleDisplayPointerUp}
              onPointerCancel={handleDisplayPointerCancel}
            >
              <span>{entry} грн</span>
              <small>Потягни вгору для журналу транзакцій</small>
            </div>
            <div className="alba-keypad-grid">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                ".",
                "0",
                "<-",
              ].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (key === "<-") {
                      backspace();
                      return;
                    }
                    pushDigit(key);
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {transactionJournalOpen ? (
        <div
          className="alba-keypad-overlay alba-category-editor-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Журнал транзакцій"
          style={{ background: `rgba(10, 14, 24, ${transactionJournalBackdropAlpha})` }}
          onClick={requestCloseTransactionJournal}
        >
          <div
            className={`alba-keypad-panel alba-category-editor-panel alba-transaction-journal-panel ${
              transactionJournalClosing ? "is-closing" : ""
            } ${
              transactionJournalDragging ? "is-dragging" : ""
            }`}
            style={{ transform: `translateY(${transactionJournalOffsetY}px)` }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="alba-transaction-journal-grab"
              onPointerDown={handleTransactionJournalDragStart}
              onPointerMove={handleTransactionJournalDragMove}
              onPointerUp={handleTransactionJournalDragEnd}
              onPointerCancel={handleTransactionJournalDragEnd}
            >
              <button
                type="button"
                className="alba-category-editor-handle"
                aria-label="Потягнути вниз щоб сховати журнал"
              >
                <span className="alba-category-editor-handle-bar" aria-hidden="true" />
              </button>

              <div className="alba-subcategory-sheet-head">
                <div>
                  <h3>Журнал транзакцій</h3>
                  {journalEditingTransactionId ? (
                    <p className="alba-journal-live-amount">
                      Вводиш: {money(Number(transactionDrafts[journalEditingTransactionId] || 0))}
                    </p>
                  ) : null}
                </div>
                <span className="alba-subcategory-limit">{transactionJournalRows.length}</span>
              </div>
            </div>

            <div className="alba-transaction-journal-list">
              {transactionJournalRows.length ? (
                transactionJournalRows.map((transaction) => {
                  const transactionDate = transactionDateFromValue(transaction.createdAt);
                  const dateLabel = transactionDate
                    ? transactionDate.toLocaleDateString("uk-UA", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Без дати";
                  const isBusy = transactionJournalBusyId === transaction.id;
                  const isExpense = transaction.type !== "income";
                  const swipeX = Number(transactionSwipeOffset[transaction.id] || 0);
                  const isDeleteReveal = swipeX <= -52;
                  const isDeleting = transactionSwipeDeletingId === transaction.id;
                  const isEditing = journalEditingTransactionId === transaction.id;
                  const previewAmount =
                    isEditing && Number.isFinite(Number(transactionDrafts[transaction.id]))
                      ? Number(transactionDrafts[transaction.id])
                      : Number(transaction.amount || 0);

                  return (
                    <article
                      key={transaction.id}
                      data-transaction-row-id={transaction.id}
                      className={`alba-transaction-journal-row ${isDeleteReveal ? "is-delete-reveal" : ""} ${
                        isDeleting ? "is-deleting" : ""
                      } ${isEditing ? "is-editing" : ""}`}
                      style={{ transform: `translateX(${swipeX}px)` }}
                      onClick={() => {
                        if (isDeleting) return;
                        startTransactionNativeEdit(transaction.id);
                      }}
                      onPointerDown={(event) => handleTransactionRowPointerDown(transaction.id, event)}
                      onPointerMove={(event) => handleTransactionRowPointerMove(transaction.id, event)}
                      onPointerUp={(event) => handleTransactionRowPointerUp(transaction.id, event)}
                      onPointerCancel={() => handleTransactionRowPointerCancel(transaction.id)}
                    >
                      <div className="alba-transaction-journal-head">
                        <span>{isExpense ? "Витрата" : "Дохід"}</span>
                        <strong className={isExpense ? "is-expense" : "is-income"}>
                          {money(previewAmount)}
                        </strong>
                      </div>
                      <p className="alba-subtle">{dateLabel}</p>
                      <p className="alba-subtle">
                        {transaction.accountName || "Рахунок"}
                        {isExpense
                          ? ` -> ${transaction.categoryName || "Категорія"}${transaction.subcategoryName ? ` / ${transaction.subcategoryName}` : ""}`
                          : ` <- ${transaction.sourceIncomeName || "Джерело"}`}
                      </p>
                    </article>
                  );
                })
              ) : (
                <p className="alba-subtle">Транзакцій ще немає.</p>
              )}
            </div>

            <input
              ref={journalNativeInputRef}
              className="alba-journal-native-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={journalEditingTransactionId ? transactionDrafts[journalEditingTransactionId] ?? "" : ""}
              onChange={handleJournalNativeInputChange}
              onBlur={() => {
                void handleJournalNativeInputBlur();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              aria-label="Редагування суми транзакції"
            />
          </div>
        </div>
      ) : null}

        {activeExpenseDropId ? <div className="alba-subcat-focus-backdrop" aria-hidden="true" /> : null}

        {activeExpenseDropId
          ? buildSubcategoryLayout(activeExpenseDropId).map((item) => {
              const activeCat = categories.find((c) => c.id === activeExpenseDropId);
              const { subcategory, idx } = item;
              return (
                <div
                  key={subcategory.id}
                  className={`alba-subcat-wrapper ${hoveredDropSubcategoryId === subcategory.id ? "is-drop-hover" : ""}`}
                  data-drop-subcategory={subcategory.id}
                  style={{
                    position: "fixed",
                    left: item.left,
                    top: item.top,
                    width: item.width,
                    zIndex: 50,
                    pointerEvents: "all",
                  }}
                  onDragEnter={() => {
                    setHoveredDropCategoryId(activeExpenseDropId);
                    setHoveredDropSubcategoryId(subcategory.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setHoveredDropCategoryId(activeExpenseDropId);
                    setHoveredDropSubcategoryId(subcategory.id);
                  }}
                  onDrop={() => {
                    if (activeCat) handleDropOnSubcategory(activeCat, subcategory);
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className={`alba-item-card alba-subcat-drop-card ${item.isPeripheral ? "is-peripheral" : ""}`}
                    style={{ "--subcat-delay": `${idx * 18}ms` }}
                  >
                    <div
                      className="alba-item-circle is-category"
                      style={buildSubcategoryCircleStyle(subcategory.parentCategoryId)}
                    >
                      {subcategory.icon}
                    </div>
                    <span className="alba-item-title">{subcategory.name}</span>
                    <span className="alba-item-subtitle">{money(subcategoryTotals[subcategory.id] || 0)}</span>
                  </div>
                </div>
              );
            })
          : null}

      {categoryEditor ? (
        <div
          className="alba-keypad-overlay alba-category-editor-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Редагування категорії"
          onClick={closeCategoryEditor}
        >
          <div
            className="alba-keypad-panel alba-category-editor-panel"
            style={{ transform: `translateY(${categoryEditorOffsetY}px)` }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="alba-category-editor-handle"
              onPointerDown={handleCategoryEditorDragStart}
              onPointerMove={handleCategoryEditorDragMove}
              onPointerUp={handleCategoryEditorDragEnd}
              onPointerCancel={handleCategoryEditorDragEnd}
              aria-label="Потягнути вниз щоб сховати"
            >
              <span className="alba-category-editor-handle-bar" aria-hidden="true" />
            </button>
            <p className="alba-label">{categoryEditor.id ? "Редагування категорії" : "Нова категорія"}</p>
            <div className="alba-category-editor-preview">
              <div className="alba-item-circle is-category alba-category-editor-icon" style={buildCategoryCircleStyle(categoryEditor.color)} aria-hidden="true">
                {String(categoryEditor.icon || "").trim() || buildInitials(categoryEditor.name || "Категорія")}
              </div>
              <div className="alba-category-editor-copy">
                <input
                  type="text"
                  className="alba-category-editor-title-input"
                  value={categoryEditor.name}
                  onChange={(event) => setCategoryEditor((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Назва категорії"
                  aria-label="Назва категорії"
                />
                <p>{categoryEditor.color}</p>
              </div>
            </div>

            <div className="alba-category-editor-form">
              <label className="alba-auth-form-label">
                <span className="alba-label">Набір іконок</span>
                <div className="alba-category-editor-icons-row" aria-label="Швидкий вибір іконки">
                  <button
                    type="button"
                    className="alba-category-editor-icon-option alba-category-editor-icon-all"
                    onClick={() => setCategoryIconPickerOpen(true)}
                    aria-label="Відкрити всі іконки"
                  >
                    Всі
                  </button>

                  {categoryIconPresets.slice(0, 10).map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      className={`alba-category-editor-icon-option ${categoryEditor.icon === icon ? "is-active" : ""}`}
                      onClick={() => setCategoryEditor((prev) => ({ ...prev, icon }))}
                      aria-label={`Вибрати іконку ${icon}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </label>

              <label className="alba-auth-form-label alba-category-editor-color-inline">
                <span className="alba-label">Колір</span>
                <input
                  className="alba-category-editor-color-input"
                  type="color"
                  value={categoryEditor.color}
                  onChange={(event) => setCategoryEditor((prev) => ({ ...prev, color: event.target.value }))}
                />
              </label>
            </div>

            {categoryIconPickerOpen ? (
              <div className="alba-category-icon-picker-overlay" onClick={() => setCategoryIconPickerOpen(false)}>
                <div className="alba-category-icon-picker-sheet" onClick={(event) => event.stopPropagation()}>
                  <div className="alba-category-icon-picker-head">
                    <p className="alba-label">Всі іконки</p>
                    <button
                      type="button"
                      className="alba-category-icon-picker-close"
                      onClick={() => setCategoryIconPickerOpen(false)}
                    >
                      Закрити
                    </button>
                  </div>
                  <div className="alba-category-icon-picker-grid">
                    {categoryIconPresets.map((icon) => (
                      <button
                        key={`full-${icon}`}
                        type="button"
                        className={`alba-category-editor-icon-option alba-category-icon-picker-option ${categoryEditor.icon === icon ? "is-active" : ""}`}
                        onClick={() => {
                          setCategoryEditor((prev) => ({ ...prev, icon }));
                          setCategoryIconPickerOpen(false);
                        }}
                        aria-label={`Вибрати іконку ${icon}`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {subcategoryEditor ? (
        <div
          className="alba-keypad-overlay alba-category-editor-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Редагування підкатегорій"
          onClick={() => void closeSubcategoryEditor()}
        >
          <div
            className="alba-keypad-panel alba-category-editor-panel"
            style={{ transform: `translateY(${subcategoryEditorOffsetY}px)` }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="alba-category-editor-handle"
              onPointerDown={handleSubcategoryEditorDragStart}
              onPointerMove={handleSubcategoryEditorDragMove}
              onPointerUp={handleSubcategoryEditorDragEnd}
              onPointerCancel={handleSubcategoryEditorDragEnd}
              aria-label="Потягнути вниз щоб зберегти і сховати"
            >
              <span className="alba-category-editor-handle-bar" aria-hidden="true" />
            </button>
            <div className="alba-subcategory-sheet-head">
              <div>
                <p className="alba-label">Підкатегорії</p>
                <h3>{subcategoryEditor.categoryName}</h3>
              </div>
              <span className="alba-subcategory-limit">{subcategoryEditorItems.length}/5</span>
            </div>

            {!subcategoryLimitReached ? (
              <div className="alba-subcategory-create">
                <div className="alba-subcategory-create-inputs">
                  <input
                    type="text"
                    value={subcategoryEditor.draftName}
                    onChange={(event) =>
                      setSubcategoryEditor((prev) => (prev ? { ...prev, draftName: event.target.value } : prev))
                    }
                    placeholder="Нова підкатегорія"
                    aria-label="Нова підкатегорія"
                  />
                  <button
                    type="button"
                    className="alba-subcategory-icon-trigger"
                    onClick={() => setSubcategoryIconPicker({ mode: "draft" })}
                    aria-label="Іконка підкатегорії"
                  >
                    <span>{subcategoryEditor.draftIcon || "Авто"}</span>
                  </button>
                </div>

                <div className="alba-subcategory-create-actions">
                  <button
                    type="button"
                    className="alba-primary alba-subcategory-add-button"
                    disabled={!String(subcategoryEditor.draftName || "").trim()}
                    onClick={() =>
                      handleAddSubcategory(subcategoryEditor.categoryId, subcategoryEditor.draftName, subcategoryEditor.draftIcon)
                    }
                  >
                    Додати
                  </button>
                </div>
              </div>
            ) : (
              <p className="alba-subcategory-limit-note">Максимальна кількість: 5 підкатегорій в 1 категорії.</p>
            )}

            <div className="alba-subcategory-list">
              {subcategoryEditorItems.length ? (
                subcategoryEditorItems.map((item) => (
                  <div key={item.id} className="alba-subcategory-row">
                    <div
                      className="alba-item-circle is-category alba-subcategory-row-preview"
                      style={buildSubcategoryCircleStyle(item.parentCategoryId)}
                    >
                      {item.icon || "•"}
                    </div>
                    <div className="alba-subcategory-row-fields">
                      <input
                        type="text"
                        value={item.name || ""}
                        onChange={(event) => updateSubcategoryDraft(item.id, "name", event.target.value)}
                        onBlur={(event) => handleRenameSubcategory(item.id, event.target.value, item.icon)}
                        aria-label="Назва підкатегорії"
                      />
                      <button
                        type="button"
                        className="alba-subcategory-icon-trigger"
                        onClick={() => setSubcategoryIconPicker({ mode: "item", subcategoryId: item.id })}
                        aria-label="Іконка підкатегорії"
                      >
                        <span>{item.icon || "Авто"}</span>
                      </button>
                    </div>
                    <div className="alba-subcategory-row-actions">
                      <button
                        type="button"
                        className="alba-subcategory-delete-button"
                        onClick={() => handleDeleteSubcategory(item.id)}
                      >
                        Видалити
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="alba-subtle">Ще немає підкатегорій. Додай першу.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {categoryMenu ? (
        <div className="alba-category-menu-backdrop" onClick={() => setCategoryMenu(null)} aria-hidden="true">
          <div
            className="alba-category-menu"
            style={{ left: `${categoryMenu.x}px`, top: `${categoryMenu.y}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="alba-category-menu-action alba-category-menu-add"
              onClick={() => {
                const category = categories.find((item) => item.id === categoryMenu.categoryId);
                if (category) openSubcategoryEditor(category);
                setCategoryMenu(null);
              }}
            >
              +
            </button>

            <button
              type="button"
              className="alba-category-menu-action alba-category-menu-edit"
              onClick={() => {
                const category = categories.find((item) => item.id === categoryMenu.categoryId);
                if (category) openCategoryEditor(category);
                setCategoryMenu(null);
              }}
            >
              ✎
            </button>

            <button
              type="button"
              className="alba-category-menu-action alba-category-menu-delete"
              onClick={() => {
                const category = categories.find((item) => item.id === categoryMenu.categoryId);
                if (category && window.confirm(`Видалити категорію \"${category.name}\"?`)) {
                  handleDeleteCategory(category.id);
                }
                setCategoryMenu(null);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M9 7V5h6v2" />
                <path d="M8 7l1 12h6l1-12" />
                <path d="M10 10v6" />
                <path d="M14 10v6" />
              </svg>
            </button>

            <div className="alba-category-menu-core" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      {subcategoryIconPicker ? (
        <div className="alba-category-icon-picker-overlay" onClick={() => setSubcategoryIconPicker(null)}>
          <div className="alba-category-icon-picker-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="alba-category-icon-picker-head">
              <p className="alba-label">Іконка підкатегорії</p>
              <button type="button" className="alba-category-icon-picker-close" onClick={() => setSubcategoryIconPicker(null)}>
                Закрити
              </button>
            </div>
            <div className="alba-category-icon-picker-grid">
              <button
                type="button"
                className={`alba-category-editor-icon-option alba-category-icon-picker-option ${
                  (subcategoryIconPicker.mode === "draft" ? !subcategoryEditor?.draftIcon : !subcategories.find((item) => item.id === subcategoryIconPicker.subcategoryId)?.icon)
                    ? "is-active"
                    : ""
                }`}
                onClick={() => {
                  if (subcategoryIconPicker.mode === "draft") {
                    setSubcategoryEditor((prev) => (prev ? { ...prev, draftIcon: "" } : prev));
                  } else {
                    updateSubcategoryDraft(subcategoryIconPicker.subcategoryId, "icon", "");
                  }
                  setSubcategoryIconPicker(null);
                }}
              >
                Авто
              </button>
              {categoryIconPresets.map((icon) => (
                <button
                  key={`sub-picker-${icon}`}
                  type="button"
                  className={`alba-category-editor-icon-option alba-category-icon-picker-option ${
                    (subcategoryIconPicker.mode === "draft"
                      ? subcategoryEditor?.draftIcon === icon
                      : subcategories.find((item) => item.id === subcategoryIconPicker.subcategoryId)?.icon === icon)
                      ? "is-active"
                      : ""
                  }`}
                  onClick={() => {
                    if (subcategoryIconPicker.mode === "draft") {
                      setSubcategoryEditor((prev) => (prev ? { ...prev, draftIcon: icon } : prev));
                    } else {
                      updateSubcategoryDraft(subcategoryIconPicker.subcategoryId, "icon", icon);
                    }
                    setSubcategoryIconPicker(null);
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {itemEditor ? (
        <div
          className="alba-keypad-overlay alba-category-editor-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={itemEditor.type === "account" ? "Редагування рахунку" : "Редагування доходу"}
          onClick={closeItemEditor}
        >
          <div className="alba-keypad-panel alba-category-editor-panel" onClick={(event) => event.stopPropagation()}>
            <p className="alba-label">{itemEditor.id ? "Редагування" : "Створення"}</p>
            <h3>{itemEditor.type === "account" ? "Рахунок" : "Джерело доходу"}</h3>
            <div className="alba-item-editor-form">
              <label className="alba-auth-form-label">
                <span className="alba-label">Назва</span>
                <input
                  type="text"
                  value={itemEditor.name}
                  onChange={(event) => setItemEditor((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder={itemEditor.type === "account" ? "Назва рахунку" : "Назва джерела"}
                />
              </label>
              {itemEditor.type === "account" ? (
                <label className="alba-auth-form-label">
                  <span className="alba-label">Баланс</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={itemEditor.balance}
                    onChange={(event) => setItemEditor((prev) => ({ ...prev, balance: event.target.value }))}
                    placeholder="0"
                  />
                </label>
              ) : null}
            </div>
            <div className="alba-subcategory-create-actions">
              <button type="button" className="alba-primary" onClick={saveItemEditor}>
                Зберегти
              </button>
              <button type="button" onClick={closeItemEditor}>
                Скасувати
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {itemMenu ? (
        <div className="alba-category-menu-backdrop" onClick={() => setItemMenu(null)} aria-hidden="true">
          <div
            className="alba-category-menu"
            style={{ left: `${itemMenu.x}px`, top: `${itemMenu.y}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="alba-category-menu-action alba-category-menu-edit"
              onClick={() => {
                if (itemMenu.type === "income") {
                  const income = incomes.find((item) => item.id === itemMenu.id);
                  if (income) openEditItemEditor("income", income);
                } else if (itemMenu.type === "account") {
                  const account = accounts.find((item) => item.id === itemMenu.id);
                  if (account) openEditItemEditor("account", account);
                }
              }}
            >
              ✎
            </button>

            <button
              type="button"
              className="alba-category-menu-action alba-category-menu-delete"
              onClick={() => {
                if (itemMenu.type === "income") {
                  if (window.confirm("Видалити цей дохід?")) {
                    handleDeleteIncome(itemMenu.id);
                  }
                } else if (itemMenu.type === "account") {
                  if (window.confirm("Видалити цей рахунок?")) {
                    handleDeleteAccount(itemMenu.id);
                  }
                }
                setItemMenu(null);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M9 7V5h6v2" />
                <path d="M8 7l1 12h6l1-12" />
                <path d="M10 10v6" />
                <path d="M14 10v6" />
              </svg>
            </button>

            <div className="alba-category-menu-core" aria-hidden="true" />
          </div>
        </div>
      ) : null}
    </div>
  );
}