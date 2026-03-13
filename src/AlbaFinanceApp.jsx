import React, { useEffect, useMemo, useRef, useState } from "react";
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

export default function AlbaFinanceApp() {
  const LOCAL_SUBCATEGORIES_KEY = "alba-local-subcategories-v1";
  const categoryHoverRef = useRef({ timer: null });
  const categoryPressRef = useRef({ timer: null, fired: false, startX: 0, startY: 0 });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [familyMembers, setFamilyMembers] = useState([]);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("andrii.disha@gmail.com");
  const [authPassword, setAuthPassword] = useState("October2020!");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [incomes, setIncomes] = useState(initialIncomes);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [categories, setCategories] = useState(initialCategories);
  const [subcategories, setSubcategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isIncomesOpen, setIsIncomesOpen] = useState(false);
  const [isAccountsOpen, setIsAccountsOpen] = useState(true);
  const [isExpensesOpen, setIsExpensesOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("home");
  const [draggedIncomeId, setDraggedIncomeId] = useState(null);
  const [draggedAccountId, setDraggedAccountId] = useState(null);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [entry, setEntry] = useState("0");
  const [target, setTarget] = useState(null);
  const [categoryMenu, setCategoryMenu] = useState(null);
  const [itemMenu, setItemMenu] = useState(null);
  const [activeExpenseDropId, setActiveExpenseDropId] = useState(null);
  const [subcatAnchor, setSubcatAnchor] = useState({ x: 0, y: 0 });
  const [syncMode, setSyncMode] = useState(isFirebaseConfigured ? "firebase" : "local");
  const touchHoldRef = useRef({ timer: null, fired: false });

  function buildSubcategoryLayout(parentCategoryId) {
    const allItems = subcategories.filter((s) => s.parentCategoryId === parentCategoryId).slice(0, 6);
    const RADIUS = 72;
    const CARD_W = 60;
    const CARD_H = 70;
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const isLeftEdge = subcatAnchor.x < 84;
    const isRightEdge = subcatAnchor.x > vw - 84;
    const edgeMode = isLeftEdge || isRightEdge;
    const items = edgeMode ? allItems.slice(0, 4) : allItems;

    const angles = edgeMode
      ? isRightEdge
        ? [0, -60, -120, 180]
        : [0, 60, 120, 180]
      : [0, 60, 120, 180, 240, 300];

    return items.map((subcategory, idx) => {
      // Базово старт з 12:00; для крайніх категорій - 4 підкатегорії "всередину".
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
        isPeripheral: edgeMode && idx >= 2,
      };
    });
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
        // Якщо наводимо на підкатегорію — не скидаємо активну категорію
        if (hovered?.closest("[data-drop-subcategory]")) return;

        const withinZone =
          !!activeExpenseDropId &&
          Math.hypot(touch.clientX - subcatAnchor.x, touch.clientY - subcatAnchor.y) <= 122;
        if (withinZone) {
          return;
        }

        const expenseCategoryEl = hovered?.closest("[data-expense-category]");
        const newCatId = expenseCategoryEl ? expenseCategoryEl.getAttribute("data-expense-category") : null;

        if (categoryHoverRef.current.timer) {
          clearTimeout(categoryHoverRef.current.timer);
          categoryHoverRef.current.timer = null;
        }

        if (newCatId === activeExpenseDropId) return;

        // Щоб підкатегорії не зникали миттєво біля сусідньої категорії.
        categoryHoverRef.current.timer = setTimeout(
          () => {
            setActiveExpenseDropId(newCatId);
            if (expenseCategoryEl) {
              const r = expenseCategoryEl.getBoundingClientRect();
              setSubcatAnchor({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }
          },
          newCatId ? 180 : 360
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
    if (categoryHoverRef.current.timer) {
      clearTimeout(categoryHoverRef.current.timer);
      categoryHoverRef.current.timer = null;
    }
    // Додаємо затримку перед зникненням панелі підкатегорій
    setTimeout(() => {
      setActiveExpenseDropId(null);
    }, 650);
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
    if (!db) {
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
      return;
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
    });

    const unsubscribeAccounts = onSnapshot(accountsCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

      setAccounts(docs);
    });

    const unsubscribeCategories = onSnapshot(categoriesCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

      setCategories(docs);
    });

    const unsubscribeFamily = onSnapshot(familyCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

      setFamilyMembers(docs);
    });

    const unsubscribeSubcategories = onSnapshot(subcategoriesCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setSubcategories(docs);
    });

    const unsubscribeTransactions = onSnapshot(transactionsCol, (snapshot) => {
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setTransactions(docs);
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
    return transactions.reduce((accumulator, transaction) => {
      if (transaction.type !== "expense" || !transaction.categoryId) return accumulator;
      const nextAmount = Number(transaction.amount || 0);
      if (!nextAmount || Number.isNaN(nextAmount)) return accumulator;
      accumulator[transaction.categoryId] = (accumulator[transaction.categoryId] || 0) + nextAmount;
      return accumulator;
    }, {});
  }, [transactions]);

  const subcategoryTotals = useMemo(() => {
    return transactions.reduce((accumulator, transaction) => {
      if (transaction.type !== "expense" || !transaction.subcategoryId) return accumulator;
      const nextAmount = Number(transaction.amount || 0);
      if (!nextAmount || Number.isNaN(nextAmount)) return accumulator;
      accumulator[transaction.subcategoryId] = (accumulator[transaction.subcategoryId] || 0) + nextAmount;
      return accumulator;
    }, {});
  }, [transactions]);

  const userInitials = useMemo(() => buildInitials(userEmail || "Мій профіль"), [userEmail]);

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

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");

    if (!auth) {
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
    if (db && currentUserId) {
      try {
        await deleteDoc(doc(db, "users", currentUserId, "accounts", id));
        return;
      } catch {
        window.alert("Не вдалося видалити рахунок у Firebase.");
        return;
      }
    }
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

    if (db && currentUserId) {
      try {
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

  async function handleAddAccount() {
    const name = window.prompt("Назва рахунку");
    if (!name) return;

    if (db && currentUserId) {
      try {
        await addDoc(collection(db, "users", currentUserId, "accounts"), {
          name,
          balance: 0,
          type: "custom",
          createdAt: serverTimestamp(),
        });
        return;
      } catch (error) {
        window.alert("Не вдалося записати рахунок у Firebase. Перевір правила Firestore.");
        return;
      }
    }

    setAccounts((prev) => [
      ...prev,
      {
        id: `acc-${Date.now()}`,
        name,
        balance: 0,
        type: "custom",
      },
    ]);
  }

  async function handleAddIncome() {
    const name = window.prompt("Назва доходу");
    if (!name) return;

    const amountRaw = window.prompt("Сума доходу");
    const amount = Number(amountRaw || 0);

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      window.alert("Введи коректну суму більше 0");
      return;
    }

    if (db && currentUserId) {
      try {
        await addDoc(collection(db, "users", currentUserId, "incomes"), {
          name,
          amount,
          createdAt: serverTimestamp(),
        });
        return;
      } catch (error) {
        window.alert("Не вдалося записати дохід у Firebase. Перевір правила Firestore.");
        return;
      }
    }

    setIncomes((prev) => [
      ...prev,
      {
        id: `inc-${Date.now()}`,
        name,
        amount,
      },
    ]);
  }

  async function handleAddCategory() {
    const name = window.prompt("Назва категорії");
    if (!name) return;

    if (db && currentUserId) {
      try {
        await addDoc(collection(db, "users", currentUserId, "categories"), {
          name,
          icon: name.slice(0, 2).toUpperCase(),
          createdAt: serverTimestamp(),
        });
        return;
      } catch (error) {
        window.alert("Не вдалося записати категорію у Firebase. Перевір правила Firestore.");
        return;
      }
    }

    setCategories((prev) => [
      ...prev,
      {
        id: `cat-${Date.now()}`,
        name,
        icon: name.slice(0, 2).toUpperCase(),
      },
    ]);
  }

  async function handleAddSubcategory(category) {
    const existing = subcategories.filter((s) => s.parentCategoryId === category.id);
    if (existing.length >= 6) {
      window.alert(`Максимум 6 підкатегорій для "${category.name}"`);
      return;
    }
    const name = window.prompt(`Назва підкатегорії для "${category.name}"`);
    if (!name) return;

    const draft = {
      name,
      icon: name.slice(0, 2).toUpperCase(),
      parentCategoryId: category.id,
    };

    if (db && currentUserId) {
      try {
        await addDoc(collection(db, "users", currentUserId, "subcategories"), {
          ...draft,
          createdAt: serverTimestamp(),
        });
        return;
      } catch (error) {
        window.alert("Не вдалося записати підкатегорію у Firebase. Перевір правила Firestore.");
        return;
      }
    }

    setSubcategories((prev) => [...prev, { id: `sub-${Date.now()}`, ...draft }]);
  }

  async function handleEditCategory(category) {
    const name = window.prompt("Нова назва категорії", category.name);
    if (!name || name === category.name) return;

    const payload = {
      name,
      icon: name.slice(0, 2).toUpperCase(),
    };

    if (db && currentUserId) {
      try {
        await updateDoc(doc(db, "users", currentUserId, "categories", category.id), payload);
        return;
      } catch (error) {
        window.alert("Не вдалося оновити категорію у Firebase. Перевір правила Firestore.");
        return;
      }
    }

    setCategories((prev) => prev.map((item) => (item.id === category.id ? { ...item, ...payload } : item)));
  }

  function handleDropOnCategory(category, accountFromTouch = null) {
    const sourceAccount = accountFromTouch || draggedAccount;
    if (!sourceAccount) return;
    setTarget({ account: sourceAccount, category });
    setEntry("0");
    setKeypadOpen(true);
    setDraggedAccountId(null);
    setActiveExpenseDropId(null);
  }

  function handleDropOnSubcategory(category, subcategory, accountFromTouch = null) {
    const sourceAccount = accountFromTouch || draggedAccount;
    if (!sourceAccount) return;
    setTarget({ account: sourceAccount, category, subcategory });
    setEntry("0");
    setKeypadOpen(true);
    setDraggedAccountId(null);
    setActiveExpenseDropId(null);
  }

  async function handleDropIncomeOnAccount(account, incomeFromTouch = null) {
    const sourceIncome = incomeFromTouch || draggedIncome;
    if (!sourceIncome) return;

    const amount = Number(sourceIncome.amount || 0);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      setDraggedIncomeId(null);
      return;
    }

    if (db && currentUserId) {
      try {
        const nextBalance = Math.max(0, Number(account.balance || 0) + amount);

        await updateDoc(doc(db, "users", currentUserId, "accounts", account.id), {
          balance: nextBalance,
        });

        await addDoc(collection(db, "users", currentUserId, "transactions"), {
          accountId: account.id,
          accountName: account.name,
          categoryId: null,
          categoryName: "Дохід",
          amount,
          type: "income",
          sourceIncomeId: sourceIncome.id,
          sourceIncomeName: sourceIncome.name,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        window.alert("Не вдалося зарахувати дохід у Firebase. Операцію скасовано.");
        setDraggedIncomeId(null);
        return;
      }
    } else {
      setAccounts((prev) =>
        prev.map((item) => {
          if (item.id !== account.id) return item;
          return { ...item, balance: Math.max(0, Number(item.balance || 0) + amount) };
        })
      );
    }

    setDraggedIncomeId(null);
  }

  function handleCategoryTouchStart(category, event) {
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
      setCategoryMenu({
        categoryId: category.id,
        x: anchorX,
        y: anchorY,
      });
    }, 480);
  }

  function handleCategoryTouchMove(event) {
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

    if (db && currentUserId) {
      try {
        const currentAccount = accounts.find((account) => account.id === target.account.id);
        if (!currentAccount) return;

        const nextBalance = Math.max(0, Number(currentAccount.balance || 0) - amount);

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
        return { ...account, balance: Math.max(0, account.balance - amount) };
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
      },
    ]);

    setKeypadOpen(false);
    setTarget(null);
    setEntry("0");
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
    <div className="alba-shell">
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
                      <span className="alba-item-subtitle">{money(income.amount)}</span>
                    </article>
                  ))}
                  <button
                    type="button"
                    className="alba-item-card alba-item-add"
                    onClick={handleAddIncome}
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
                    <span className="alba-item-subtitle">{money(account.balance)}</span>
                  </article>
                ))}
                <button
                  type="button"
                  className="alba-item-card alba-item-add"
                  onClick={handleAddAccount}
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
                    className="alba-category-wrap"
                    data-expense-category={category.id}
                    style={{ opacity: activeExpenseDropId && activeExpenseDropId !== category.id ? 0.45 : 1 }}
                  >
                    <button
                      type="button"
                      className="alba-category-card alba-item-card"
                      data-drop-category={category.id}
                      data-expense-category={category.id}
                      onDragEnter={(event) => {
                        if (draggedAccountId) {
                          setActiveExpenseDropId(category.id);
                          const r = event.currentTarget.getBoundingClientRect();
                          setSubcatAnchor({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                        }
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (draggedAccountId) setActiveExpenseDropId(category.id);
                      }}
                      onDrop={() => handleDropOnCategory(category)}
                      onTouchStart={(event) => handleCategoryTouchStart(category, event)}
                      onTouchMove={handleCategoryTouchMove}
                      onTouchEnd={handleCategoryTouchEnd}
                      aria-label={`Категорія витрат ${category.name}`}
                    >
                      <div className="alba-item-circle is-category" aria-hidden="true">
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
                  onClick={handleAddCategory}
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
            <p className="alba-label">Розподіл витрат</p>
            <h3>
              {target.account.name} до {target.category.name}
              {target.subcategory ? ` / ${target.subcategory.name}` : ""}
            </h3>
            <div className="alba-display">{entry} грн</div>
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
                Підтвердити
              </button>
            </div>
          </div>
        </div>
      ) : null}

        {activeExpenseDropId
          ? buildSubcategoryLayout(activeExpenseDropId).map((item) => {
              const activeCat = categories.find((c) => c.id === activeExpenseDropId);
              const { subcategory, idx } = item;
              return (
                <div
                  key={subcategory.id}
                  className="alba-subcat-wrapper"
                  data-drop-subcategory={subcategory.id}
                  style={{
                    position: "fixed",
                    left: item.left,
                    top: item.top,
                    width: item.width,
                    zIndex: 50,
                    pointerEvents: "all",
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (activeCat) handleDropOnSubcategory(activeCat, subcategory);
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className={`alba-item-card alba-subcat-drop-card ${item.isPeripheral ? "is-peripheral" : ""}`}
                    style={{ "--subcat-delay": `${idx * 55}ms` }}
                  >
                    <div className="alba-item-circle is-category">{subcategory.icon}</div>
                    <span className="alba-item-title">{subcategory.name}</span>
                    <span className="alba-item-subtitle">{money(subcategoryTotals[subcategory.id] || 0)}</span>
                  </div>
                </div>
              );
            })
          : null}

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
                if (category) handleAddSubcategory(category);
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
                if (category) handleEditCategory(category);
                setCategoryMenu(null);
              }}
            >
              ✎
            </button>

            <button
              type="button"
              className="alba-category-menu-action alba-category-menu-del-sub"
              onClick={() => {
                const category = categories.find((item) => item.id === categoryMenu.categoryId);
                if (!category) {
                  setCategoryMenu(null);
                  return;
                }

                const pool = subcategories.filter((item) => item.parentCategoryId === category.id);
                if (pool.length === 0) {
                  window.alert("Немає підкатегорій для видалення.");
                  setCategoryMenu(null);
                  return;
                }

                const options = pool.map((item, index) => `${index + 1}. ${item.name}`).join("\n");
                const raw = window.prompt(`Введи номер підкатегорії для видалення:\n${options}`);
                const idx = Number(raw) - 1;
                if (!Number.isInteger(idx) || idx < 0 || idx >= pool.length) {
                  setCategoryMenu(null);
                  return;
                }
                const chosen = pool[idx];
                if (window.confirm(`Видалити підкатегорію \"${chosen.name}\"?`)) {
                  handleDeleteSubcategory(chosen.id);
                }
                setCategoryMenu(null);
              }}
            >
              ⊖
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
              🗑
            </button>

            <div className="alba-category-menu-core" aria-hidden="true" />
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
              🗑
            </button>

            <div className="alba-category-menu-core" aria-hidden="true" />
          </div>
        </div>
      ) : null}
    </div>
  );
}