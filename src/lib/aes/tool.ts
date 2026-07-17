// AES 加解密工具核心逻辑
// 两层密钥模型：密钥组（按国家/区域分类存储） -> 组内多对 (密钥ID, Key, IV)
// 密钥ID 组内唯一，嵌入密文用于解密匹配；密钥组不进密文，仅用于管理。
// 密文格式：[FLAG][密钥ID]#[BASE64_CIPHER]=$=
// 使用浏览器原生 Web Crypto API（AES-CBC + PKCS7），与 CryptoJS 字节级兼容。

export interface KeyEntry {
  id: number; // 密钥ID（组内唯一，正整数）
  keyHex: string;
  ivHex: string;
}

export interface KeyGroup {
  name: string; // 密钥组名（全局唯一，如 德国/英国/澳洲）
  keys: KeyEntry[];
}

export type KeyStore = KeyGroup[];

export interface AuditLog {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  msg: string;
}

export interface CryptoResult {
  success: boolean;
  result: string;
  logs: AuditLog[];
}

export const SUBFIX = "=$=";

/** 加密类型 -> 密文前缀标志映射 */
export const ENCRYPT_TYPES_MAP: Record<string, string> = {
  USER: "Y!$U#",
  PHONE: "Y!$P#",
  MAIL: "Y!$M#",
  ADDRESS: "Y!$A#",
  IDCARD: "Y!$I#",
  SPECIAL: "Y!$S#",
  FINANCE: "Y!$F#",
  MEDIA: "Y!$D#",
  WORK: "Y!$E#",
  CAR: "Y!$C#",
  IP: "Y!$B#",
  OTHER: "Y!$O#",
};

export const ENCRYPT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "USER", label: "👤 USER (Y!$U#)" },
  { value: "PHONE", label: "📱 PHONE (Y!$P#)" },
  { value: "MAIL", label: "✉️ MAIL (Y!$M#)" },
  { value: "ADDRESS", label: "🏠 ADDRESS (Y!$A#)" },
  { value: "IDCARD", label: "🆔 IDCARD (Y!$I#)" },
  { value: "SPECIAL", label: "✨ SPECIAL (Y!$S#)" },
  { value: "FINANCE", label: "💰 FINANCE (Y!$F#)" },
  { value: "MEDIA", label: "🎬 MEDIA (Y!$D#)" },
  { value: "WORK", label: "💼 WORK (Y!$E#)" },
  { value: "CAR", label: "🚗 CAR (Y!$C#)" },
  { value: "IP", label: "🌐 IP (Y!$B#)" },
  { value: "OTHER", label: "⚙️ OTHER (Y!$O#)" },
];

/** 默认密钥库（与原工具默认 key/iv 一致） */
export const DEFAULT_KEY_STORE: KeyStore = [
  {
    name: "默认",
    keys: [
      {
        id: 1,
        keyHex: "4fa5d12774840850893353aadd092d1d46f65aabc42523383e62c2077cc08844",
        ivHex: "92ec31915aa564ebda7c0c387eafae58",
      },
    ],
  },
];

const STORE_KEY = "aes_tool_key_store";

// ===================== 字节编码工具 =====================

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const len = clean.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateRandomKey(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function generateRandomIv(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

// ===================== AES-CBC 核心加解密 =====================

async function aesEncrypt(plainText: string, keyHex: string, ivHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex) as Uint8Array<ArrayBuffer>;
  const ivBytes = hexToBytes(ivHex) as Uint8Array<ArrayBuffer>;
  const plainBytes = new TextEncoder().encode(plainText);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-CBC", iv: ivBytes }, key, plainBytes as BufferSource);
  return bytesToBase64(new Uint8Array(cipherBuf));
}

async function aesDecrypt(base64Cipher: string, keyHex: string, ivHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex) as Uint8Array<ArrayBuffer>;
  const ivBytes = hexToBytes(ivHex) as Uint8Array<ArrayBuffer>;
  const cipherBytes = base64ToBytes(base64Cipher);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, key, cipherBytes as BufferSource);
  return new TextDecoder().decode(plainBuf);
}

// ===================== 审计日志 + 业务流程 =====================

function nowstamp(): string {
  return new Date().toLocaleTimeString();
}

export function maskText(text: string, keep = 8): string {
  if (!text || text.length === 0) return "***";
  if (text.length <= keep) return "***";
  return text.substring(0, keep) + "..." + text.substring(text.length - keep);
}

/** 从密文解析密钥ID；无法解析返回 null */
export function parseCipherKeyId(cipherFullText: string): number | null {
  try {
    let raw = cipherFullText;
    if (raw.endsWith(SUBFIX)) raw = raw.slice(0, -SUBFIX.length);
    const h1 = raw.indexOf("#");
    const h2 = raw.indexOf("#", h1 + 1);
    if (h1 === -1 || h2 === -1) return null;
    const id = parseInt(raw.substring(h1 + 1, h2), 10);
    return isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

export async function encryptWithAudit(
  encryptType: string,
  plainText: string,
  entry: KeyEntry,
  groupName: string
): Promise<CryptoResult> {
  const start = performance.now();
  const logs: AuditLog[] = [];
  const addLog = (level: AuditLog["level"], msg: string) =>
    logs.push({ timestamp: nowstamp(), level, msg });
  try {
    if (!plainText && plainText !== "") throw new Error("明文不能为空");
    const flag = ENCRYPT_TYPES_MAP[encryptType] || ENCRYPT_TYPES_MAP.OTHER;
    addLog("INFO", "══════════ [ENCRYPT START] ══════════");
    addLog("INFO", `type: ${encryptType} | flag: ${flag} | group: ${groupName} | keyId: ${entry.id}`);
    addLog("INFO", `plainLen: ${plainText.length} | plainText: ${maskText(plainText)}`);
    const base64Cipher = await aesEncrypt(plainText, entry.keyHex, entry.ivHex);
    const finalCipher = `${flag}${entry.id}#${base64Cipher}${SUBFIX}`;
    const cost = (performance.now() - start).toFixed(2);
    addLog("INFO", `cipherLen: ${finalCipher.length} | cost(ms): ${cost}`);
    addLog("INFO", "══════════════════════════════════");
    return { success: true, result: finalCipher, logs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addLog("ERROR", `加密失败: ${msg}`);
    return { success: false, result: msg, logs };
  }
}

export async function decryptWithAudit(
  cipherFullText: string,
  entry: KeyEntry,
  groupName: string
): Promise<CryptoResult> {
  const start = performance.now();
  const logs: AuditLog[] = [];
  const addLog = (level: AuditLog["level"], msg: string) =>
    logs.push({ timestamp: nowstamp(), level, msg });
  try {
    if (!cipherFullText) throw new Error("密文不能为空");
    let raw = cipherFullText;
    addLog("INFO", "══════════ [DECRYPT START] ══════════");
    addLog("INFO", `input: ${maskText(raw, 12)}`);
    if (raw.endsWith(SUBFIX)) raw = raw.slice(0, -SUBFIX.length);
    const firstHash = raw.indexOf("#");
    const secondHash = raw.indexOf("#", firstHash + 1);
    if (firstHash === -1 || secondHash === -1) throw new Error("非法密文格式");
    const cipherKeyId = parseInt(raw.substring(firstHash + 1, secondHash), 10);
    const base64Part = raw.substring(secondHash + 1);
    addLog("INFO", `group: ${groupName} | cipherKeyId: ${cipherKeyId} | selectedKeyId: ${entry.id} | base64Len: ${base64Part.length}`);
    if (cipherKeyId !== entry.id)
      addLog("WARN", `⚠️ 密文密钥ID(${cipherKeyId}) 与所选(${entry.id})不一致，可能选错密钥组`);
    const plainResult = await aesDecrypt(base64Part, entry.keyHex, entry.ivHex);
    const cost = (performance.now() - start).toFixed(2);
    addLog("INFO", `解密成功 | plainLen: ${plainResult.length} | cost(ms): ${cost}`);
    addLog("INFO", "══════════════════════════════════");
    return { success: true, result: plainResult, logs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addLog("ERROR", `解密失败: ${msg}`);
    return { success: false, result: msg, logs };
  }
}

// ===================== 密钥库查询/校验/持久化 =====================

export function findGroup(store: KeyStore, name: string): KeyGroup | undefined {
  return store.find((g) => g.name === name);
}

export function findEntry(store: KeyStore, groupName: string, keyId: number): KeyEntry | undefined {
  return findGroup(store, groupName)?.keys.find((k) => k.id === keyId);
}

/** 找出所有包含指定密钥ID的组（密钥ID组内唯一，但不同组可能有相同ID） */
export function findGroupsByKeyId(store: KeyStore, keyId: number): KeyGroup[] {
  return store.filter((g) => g.keys.some((k) => k.id === keyId));
}

/** 生成组内下一个密钥ID（组内最大ID + 1） */
export function nextKeyId(group: KeyGroup): number {
  return group.keys.length > 0 ? Math.max(...group.keys.map((k) => k.id)) + 1 : 1;
}

/** 校验密钥组名：非空且不含破坏密文格式的字符（# =） */
export function isValidGroupName(name: string): boolean {
  return !!name && !/[#=]/.test(name);
}

/** 校验密钥库，返回首个错误信息，全部合法返回 null */
export function validateKeyStore(store: KeyStore): string | null {
  const groupNames = new Set<string>();
  for (const g of store) {
    if (!isValidGroupName(g.name))
      return `密钥组名「${g.name}」不合法（不能为空，不能包含 # 或 =）`;
    if (groupNames.has(g.name)) return `密钥组名「${g.name}」重复`;
    groupNames.add(g.name);
    if (g.keys.length === 0) return `密钥组「${g.name}」没有密钥，请添加密钥或删除该组`;
    const ids = new Set<number>();
    for (const k of g.keys) {
      if (!Number.isInteger(k.id) || k.id <= 0)
        return `密钥组「${g.name}」的密钥ID ${k.id} 必须是正整数`;
      if (ids.has(k.id)) return `密钥组「${g.name}」的密钥ID ${k.id} 重复`;
      ids.add(k.id);
      if (!/^[0-9a-fA-F]+$/.test(k.keyHex))
        return `密钥组「${g.name}」ID=${k.id} 的 Key 不是有效的十六进制字符串`;
      if (k.keyHex.length !== 64 && k.keyHex.length !== 48 && k.keyHex.length !== 32)
        return `密钥组「${g.name}」ID=${k.id} 的 Key 长度应为 32/48/64 hex 字符，当前 ${k.keyHex.length}`;
      if (!/^[0-9a-fA-F]+$/.test(k.ivHex))
        return `密钥组「${g.name}」ID=${k.id} 的 IV 不是有效的十六进制字符串`;
      if (k.ivHex.length !== 32)
        return `密钥组「${g.name}」ID=${k.id} 的 IV 长度必须为 32 hex 字符(16字节)，当前 ${k.ivHex.length}`;
    }
  }
  return null;
}

/** 从 localStorage 读取密钥库；不存在/损坏回退默认；兼容旧版格式并迁移 */
export function loadKeyStore(): KeyStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 新格式：KeyGroup[]
      if (Array.isArray(parsed) && parsed.every((g) => g && typeof g.name === "string" && Array.isArray(g.keys))) {
        return parsed as KeyStore;
      }
      // 迁移旧格式 Record<string, {keyHex, ivHex}>：每个旧组变成一个新组，原密钥作为组内 ID=1
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const migrated: KeyStore = [];
        for (const [name, e] of Object.entries(parsed as Record<string, unknown>)) {
          const entry = e as { keyHex?: string; ivHex?: string };
          if (entry && typeof entry.keyHex === "string" && typeof entry.ivHex === "string") {
            migrated.push({ name, keys: [{ id: 1, keyHex: entry.keyHex, ivHex: entry.ivHex }] });
          }
        }
        if (migrated.length > 0) return migrated;
      }
    }
  } catch {
    /* ignore */
  }
  return JSON.parse(JSON.stringify(DEFAULT_KEY_STORE));
}

export function saveKeyStore(store: KeyStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}
