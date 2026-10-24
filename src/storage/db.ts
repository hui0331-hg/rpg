/**
 * 存档层：整个游戏状态就是一个 JSON，存进 IndexedDB 的单条记录。
 *
 * 为什么用「一整块状态」而不是关系表：
 * - 单用户、数据量小（一年几千条记录 ≈ 1MB 以内）
 * - 导出/导入/备份 = 一个文件，零心智负担
 * - 换设备直接 JSON 搬过去
 * 如果以后要支持多端同步，再换成表结构也不影响上层。
 */
import type { AppState } from '../types'

const DB_NAME = 'personal-rpg'
const DB_VERSION = 1
const STORE = 'kv'
const SAVE_KEY = 'state'
const LS_KEY = 'personal-rpg:state'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('打开数据库失败'))
  })
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(key)
        req.onsuccess = () => resolve(req.result as T | undefined)
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => db.close()
      }),
  )
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(value, key)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }),
  )
}

function idbDel(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(key)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }),
  )
}

/* ----------------------------- 对外 API ----------------------------- */

export async function loadState(): Promise<AppState | null> {
  try {
    const v = await idbGet<AppState>(SAVE_KEY)
    if (v) return v
  } catch {
    // 隐私模式等场景 IndexedDB 可能不可用，退回 localStorage
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    /* ignore */
  }
  return null
}

export async function saveState(state: AppState): Promise<void> {
  try {
    await idbSet(SAVE_KEY, state)
    return
  } catch {
    /* 落盘失败时退回 localStorage */
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* 存储满/被禁用时静默失败，UI 侧另有提示 */
  }
}

export async function clearState(): Promise<void> {
  try {
    await idbDel(SAVE_KEY)
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
