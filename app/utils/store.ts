import { create } from "zustand";
import { combine, persist } from "zustand/middleware";
import { Updater } from "../typing";
import { deepClone } from "./clone";
import { openDB, deleteDB } from "idb";
import { StateStorage } from "zustand/middleware";

type SecondParam<T> = T extends (
  _f: infer _F,
  _s: infer S,
  ...args: infer _U
) => any
  ? S
  : never;

type MakeUpdater<T> = {
  lastUpdateTime: number;

  markUpdate: () => void;
  update: Updater<T>;
};

type SetStoreState<T> = (
  partial: T | Partial<T> | ((state: T) => T | Partial<T>),
  replace?: boolean | undefined,
) => void;

export function createPersistStore<T extends object, M>(
  state: T,
  methods: (
    set: SetStoreState<T & MakeUpdater<T>>,
    get: () => T & MakeUpdater<T>,
  ) => M,
  persistOptions: SecondParam<typeof persist<T & M & MakeUpdater<T>>>,
) {
  return create(
    persist(
      combine(
        {
          ...state,
          lastUpdateTime: 0,
        },
        (set, get) => {
          return {
            ...methods(set, get as any),

            markUpdate() {
              set({ lastUpdateTime: Date.now() } as Partial<
                T & M & MakeUpdater<T>
              >);
            },
            update(updater) {
              const state = deepClone(get());
              updater(state);
              set({
                ...state,
                lastUpdateTime: Date.now(),
              });
            },
          } as M & MakeUpdater<T>;
        },
      ),
      persistOptions as any,
    ),
  );
}


const DB_NAME = "zj-ai-store";
const STORE_NAME = "data-store";
const BACKUP_NAME = "backup-store";
let dbPromise: any;
if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
  dbPromise = openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export const setItem = async (
  key: IDBKeyRange | IDBValidKey | undefined,
  value: any,
) => {
  if (!dbPromise) return;
  const db = await dbPromise;
  // console.log(Setting item in IndexedDB: key=${key}, value=${JSON.stringify(value)});
  return db.put(STORE_NAME, value, key);
};

export const getItem = async (key: IDBKeyRange | IDBValidKey) => {
  if (!dbPromise) return;
  const db = await dbPromise;
  const value = await db.get(STORE_NAME, key);
  // console.log(Getting item from IndexedDB: key=${key}, value=${JSON.stringify(value)});
  return value;
};

export const removeItem = async (key: IDBKeyRange | IDBValidKey) => {
  if (!dbPromise) return;
  const db = await dbPromise;
  // console.log(Removing item from IndexedDB: key=${key});
  return db.delete(STORE_NAME, key);
};

export const getIndexedDbStorage: StateStorage = {
  getItem: async (name: string) => {
    const item = await getItem(name);
    return item ? JSON.stringify(item) : null; // serialize as string for Zustand
  },
  setItem: async (name: string, value: any) => {
    // console.log(Setting item in Zustand storage: name=${name}, value=${value});
    await setItem(name, JSON.parse(value)); // parse stored string value
  },
  removeItem: async (name: any) => {
    await removeItem(name);
  },
};

// Clear entire IndexedDB database
export const clearDatabase = async () => {
  if (dbPromise) {
    await dbPromise;
    await deleteDB(DB_NAME);
    // console.log(${DB_NAME} has been deleted successfully);
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
};