import { useState, useEffect, useRef, useCallback } from "react";
import {
  ShieldCheck, KeyRound, Lock, Unlock, Copy, Trash2, Eraser, Plus, RefreshCw, X,
} from "lucide-react";
import {
  ENCRYPT_TYPE_OPTIONS, DEFAULT_KEY_STORE,
  loadKeyStore, saveKeyStore, validateKeyStore, isValidGroupName,
  encryptWithAudit, decryptWithAudit, generateRandomKey, generateRandomIv,
  parseCipherKeyId, findGroupsByKeyId, nextKeyId,
  type KeyStore, type AuditLog,
} from "@/lib/aes/tool";

export default function AesToolPage() {
  const [keyStore, setKeyStore] = useState<KeyStore>(() => loadKeyStore());
  const [selectedGroupName, setSelectedGroupName] = useState<string>(
    () => keyStore[0]?.name ?? ""
  );
  const [selectedKeyId, setSelectedKeyId] = useState<number>(
    () => keyStore[0]?.keys[0]?.id ?? 1
  );

  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [encryptType, setEncryptType] = useState("USER");
  const [logs, setLogs] = useState<AuditLog[]>(() => [
    {
      timestamp: new Date().toLocaleTimeString(),
      level: "INFO",
      msg: "🚀 AES 加解密工具已启动 · 密钥组 + 密钥ID 两层管理 · CBC 模式 · 本地运算",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  // 密钥管理 Modal（draft 模式：编辑副本，保存时才生效）
  const [keyManagerOpen, setKeyManagerOpen] = useState(false);
  const [draftStore, setDraftStore] = useState<KeyStore>([]);
  // 用于组名/密钥ID编辑失败时强制 input 重新挂载回退旧值
  const [draftVersion, setDraftVersion] = useState(0);

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveKeyStore(keyStore);
  }, [keyStore]);

  const now = () => new Date().toLocaleTimeString();

  const appendLogs = useCallback((newLogs: AuditLog[]) => {
    setLogs((prev) => [...prev, ...newLogs]);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // ---------- 派生：当前选中的密钥组与密钥ID（失效时回退第一个） ----------
  const effectiveGroup = keyStore.find((g) => g.name === selectedGroupName) ?? keyStore[0];
  const effectiveGroupName = effectiveGroup?.name ?? "";
  const effectiveKeyId = effectiveGroup?.keys.find((k) => k.id === selectedKeyId)
    ? selectedKeyId
    : effectiveGroup?.keys[0]?.id ?? 0;
  const effectiveEntry = effectiveGroup?.keys.find((k) => k.id === effectiveKeyId);

  // ---------- 加解密操作 ----------
  const handleEncrypt = async () => {
    if (!effectiveEntry || !effectiveGroup) {
      appendLogs([{ timestamp: now(), level: "ERROR", msg: "请先选择有效的密钥组与密钥ID" }]);
      return;
    }
    setBusy(true);
    try {
      const r = await encryptWithAudit(encryptType, inputText, effectiveEntry, effectiveGroupName);
      setOutputText(r.success ? r.result : `❌ ${r.result}`);
      appendLogs(r.logs);
    } finally {
      setBusy(false);
    }
  };

  const handleDecrypt = async () => {
    const cipherKeyId = parseCipherKeyId(inputText);
    if (cipherKeyId === null) {
      appendLogs([{ timestamp: now(), level: "ERROR", msg: "无法从密文解析密钥ID，请检查密文格式 [FLAG][密钥ID]#[BASE64]=$=" }]);
      return;
    }
    // 先在当前选定组找该密钥ID
    let group = keyStore.find((g) => g.name === effectiveGroupName);
    let entry = group?.keys.find((k) => k.id === cipherKeyId);
    if (!entry) {
      // 当前组没有，在所有组里找包含该密钥ID的组
      const groups = findGroupsByKeyId(keyStore, cipherKeyId);
      if (groups.length === 0) {
        appendLogs([{ timestamp: now(), level: "ERROR", msg: `没有任何密钥组包含密钥ID ${cipherKeyId}` }]);
        return;
      }
      if (groups.length === 1) {
        group = groups[0];
        entry = group.keys.find((k) => k.id === cipherKeyId);
        setSelectedGroupName(group.name);
        setSelectedKeyId(cipherKeyId);
        appendLogs([{ timestamp: now(), level: "INFO", msg: `🔁 密钥ID ${cipherKeyId} 仅存在于「${group.name}」，已自动切换` }]);
      } else {
        appendLogs([{ timestamp: now(), level: "WARN", msg: `⚠️ 密钥ID ${cipherKeyId} 在多个组存在：${groups.map((g) => g.name).join("、")}，请在「密钥组」下拉中选择` }]);
        return;
      }
    } else {
      setSelectedKeyId(cipherKeyId);
    }
    if (!entry || !group) return;
    setBusy(true);
    try {
      const r = await decryptWithAudit(inputText, entry, group.name);
      setOutputText(r.success ? r.result : `❌ ${r.result}`);
      appendLogs(r.logs);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!outputText || outputText.startsWith("❌")) {
      appendLogs([{ timestamp: now(), level: "WARN", msg: "⚠️ 输出为空或错误，无法复制" }]);
      return;
    }
    try {
      await navigator.clipboard.writeText(outputText);
      appendLogs([{ timestamp: now(), level: "INFO", msg: "📋 已复制结果到剪贴板" }]);
      setCopyMsg("已复制");
      setTimeout(() => setCopyMsg(null), 1500);
    } catch {
      appendLogs([{ timestamp: now(), level: "ERROR", msg: "复制失败：剪贴板不可用" }]);
    }
  };

  const handleClear = () => {
    setInputText("");
    setOutputText("");
    appendLogs([{ timestamp: now(), level: "INFO", msg: "🧹 已清空输入输出区域" }]);
  };

  const handleClearLogs = () => setLogs([]);

  // ---------- 密钥组管理（draft） ----------
  const openKeyManager = () => {
    setDraftStore(JSON.parse(JSON.stringify(keyStore)));
    setDraftVersion((v) => v + 1);
    setKeyManagerOpen(true);
  };

  const addDraftGroup = () => {
    let name = `新密钥组${draftStore.length + 1}`;
    while (draftStore.some((g) => g.name === name)) name += "_";
    setDraftStore((prev) => [
      ...prev,
      { name, keys: [{ id: 1, keyHex: generateRandomKey(), ivHex: generateRandomIv() }] },
    ]);
    appendLogs([{ timestamp: now(), level: "INFO", msg: `➕ 添加新密钥组「${name}」（待保存）` }]);
  };

  const deleteDraftGroup = (name: string) => {
    if (!window.confirm(`确定删除密钥组「${name}」及其所有密钥吗？`)) return;
    if (draftStore.length <= 1) {
      setDraftStore(JSON.parse(JSON.stringify(DEFAULT_KEY_STORE)));
      appendLogs([{ timestamp: now(), level: "WARN", msg: "⚠️ 已是最后一个密钥组，已重置为默认" }]);
      return;
    }
    setDraftStore((prev) => prev.filter((g) => g.name !== name));
    appendLogs([{ timestamp: now(), level: "INFO", msg: `🗑️ 删除密钥组「${name}」（待保存）` }]);
  };

  const renameDraftGroup = (oldName: string, raw: string) => {
    const newName = raw.trim();
    if (newName === oldName) return;
    if (!isValidGroupName(newName)) {
      window.alert("密钥组名不能为空，且不能包含 # 或 =");
      setDraftVersion((v) => v + 1);
      return;
    }
    if (draftStore.some((g) => g.name === newName)) {
      window.alert(`密钥组名「${newName}」已存在`);
      setDraftVersion((v) => v + 1);
      return;
    }
    setDraftStore((prev) => prev.map((g) => (g.name === oldName ? { ...g, name: newName } : g)));
    appendLogs([{ timestamp: now(), level: "INFO", msg: `✏️ 密钥组「${oldName}」->「${newName}」（待保存）` }]);
  };

  const addDraftKey = (groupName: string) => {
    setDraftStore((prev) =>
      prev.map((g) => {
        if (g.name !== groupName) return g;
        return {
          ...g,
          keys: [...g.keys, { id: nextKeyId(g), keyHex: generateRandomKey(), ivHex: generateRandomIv() }],
        };
      })
    );
    appendLogs([{ timestamp: now(), level: "INFO", msg: `➕ 在「${groupName}」添加新密钥（待保存）` }]);
  };

  const deleteDraftKey = (groupName: string, keyId: number) => {
    const group = draftStore.find((g) => g.name === groupName);
    if (group && group.keys.length <= 1) {
      window.alert("每个密钥组至少保留一个密钥。如需清空请删除整个密钥组。");
      return;
    }
    setDraftStore((prev) =>
      prev.map((g) => (g.name !== groupName ? g : { ...g, keys: g.keys.filter((k) => k.id !== keyId) }))
    );
    appendLogs([{ timestamp: now(), level: "INFO", msg: `🗑️ 删除「${groupName}」密钥ID ${keyId}（待保存）` }]);
  };

  const updateDraftKeyId = (groupName: string, oldId: number, raw: string) => {
    const newId = parseInt(raw, 10);
    if (isNaN(newId) || newId <= 0) {
      window.alert("密钥ID必须是正整数");
      setDraftVersion((v) => v + 1);
      return;
    }
    if (newId === oldId) return;
    const group = draftStore.find((g) => g.name === groupName);
    if (group?.keys.some((k) => k.id === newId)) {
      window.alert(`密钥ID ${newId} 在「${groupName}」组内已存在`);
      setDraftVersion((v) => v + 1);
      return;
    }
    setDraftStore((prev) =>
      prev.map((g) =>
        g.name !== groupName ? g : { ...g, keys: g.keys.map((k) => (k.id === oldId ? { ...k, id: newId } : k)) }
      )
    );
    appendLogs([{ timestamp: now(), level: "INFO", msg: `✏️ 「${groupName}」密钥ID ${oldId} -> ${newId}（待保存）` }]);
  };

  const updateDraftKeyHex = (groupName: string, keyId: number, keyHex: string) => {
    setDraftStore((prev) =>
      prev.map((g) =>
        g.name !== groupName ? g : { ...g, keys: g.keys.map((k) => (k.id === keyId ? { ...k, keyHex } : k)) }
      )
    );
  };
  const updateDraftIvHex = (groupName: string, keyId: number, ivHex: string) => {
    setDraftStore((prev) =>
      prev.map((g) =>
        g.name !== groupName ? g : { ...g, keys: g.keys.map((k) => (k.id === keyId ? { ...k, ivHex } : k)) }
      )
    );
  };
  const genDraftKey = (groupName: string, keyId: number) => {
    const k = generateRandomKey();
    setDraftStore((prev) =>
      prev.map((g) =>
        g.name !== groupName ? g : { ...g, keys: g.keys.map((x) => (x.id === keyId ? { ...x, keyHex: k } : x)) }
      )
    );
    appendLogs([{ timestamp: now(), level: "INFO", msg: `🎲 为「${groupName}」ID=${keyId} 生成随机 Key` }]);
  };
  const genDraftIv = (groupName: string, keyId: number) => {
    const v = generateRandomIv();
    setDraftStore((prev) =>
      prev.map((g) =>
        g.name !== groupName ? g : { ...g, keys: g.keys.map((x) => (x.id === keyId ? { ...x, ivHex: v } : x)) }
      )
    );
    appendLogs([{ timestamp: now(), level: "INFO", msg: `🎲 为「${groupName}」ID=${keyId} 生成随机 IV` }]);
  };

  const saveKeys = () => {
    const err = validateKeyStore(draftStore);
    if (err) {
      appendLogs([{ timestamp: now(), level: "ERROR", msg: `❌ ${err}` }]);
      window.alert(err);
      return;
    }
    setKeyStore(draftStore);
    setKeyManagerOpen(false);
    appendLogs([
      {
        timestamp: now(),
        level: "INFO",
        msg: `✅ 密钥配置已保存，共 ${draftStore.length} 个密钥组`,
      },
    ]);
  };

  const groupOptions = keyStore.map((g) => g.name);
  const keyIdOptions = effectiveGroup?.keys ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h1 className="text-base font-semibold">AES 加解密工具</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            密钥组 + 密钥ID 两层管理 · CBC 模式
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openKeyManager}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" /> 密钥管理
          </button>
          <span className="text-xs bg-secondary text-foreground px-2.5 py-1 rounded-full">
            {effectiveGroupName || "无组"} / ID:{effectiveKeyId || "-"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-5 space-y-4">
        {/* 加密配置：类型 + 密钥组 + 密钥ID */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5">加密类型（仅加密生效）</label>
            <select
              value={encryptType}
              onChange={(e) => setEncryptType(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {ENCRYPT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">密钥组</label>
            <select
              value={effectiveGroupName}
              onChange={(e) => {
                setSelectedGroupName(e.target.value);
                setSelectedKeyId(0); // 切换组后密钥ID重置，由派生回退到该组第一个
              }}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {groupOptions.length === 0 && <option value="">（无密钥组）</option>}
              {groupOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">密钥ID</label>
            <select
              value={effectiveKeyId}
              onChange={(e) => setSelectedKeyId(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {keyIdOptions.length === 0 && <option value={0}>（无密钥）</option>}
              {keyIdOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  ID: {k.id}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          加密用所选「密钥组 + 密钥ID」的密钥，密文里只嵌入密钥ID；解密时按密文里的密钥ID自动匹配密钥组（若多组均有该ID需手动选组）。
        </p>

        {/* 输入输出双栏 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5">输入内容</label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={6}
              placeholder={"加密：请输入明文文本\n解密：请输入完整密文 (例如 Y!$U#1#Base64....=$= )"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">输出结果</label>
            <textarea
              value={outputText}
              readOnly
              rows={6}
              placeholder="加密/解密结果将显示在此..."
              className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-mono resize-y"
            />
          </div>
        </div>

        {/* 操作按钮组 */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleEncrypt}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" /> 加密
          </button>
          <button
            onClick={handleDecrypt}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Unlock className="w-3.5 h-3.5" /> 解密
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" /> {copyMsg ?? "复制结果"}
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> 清空
          </button>
          <button
            onClick={handleClearLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" /> 清空日志
          </button>
        </div>

        {/* 审计日志面板 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              📋 审计日志 (AUDIT TRAIL)
            </span>
            <small className="text-[11px] text-muted-foreground">
              每次加解密记录密钥组、密钥ID、耗时、掩码等
            </small>
          </div>
          <div
            ref={logRef}
            className="bg-slate-900 text-slate-300 font-mono text-[11px] rounded-lg p-3 max-h-[280px] overflow-y-auto border border-slate-700 leading-relaxed"
          >
            {logs.length === 0 ? (
              <span className="text-slate-500">[系统] 等待操作...</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1 pb-1 border-b border-slate-800 break-all">
                  <span className="text-slate-500">[{log.timestamp}]</span>{" "}
                  <span className={log.level === "ERROR" ? "text-red-400" : log.level === "WARN" ? "text-amber-400" : "text-green-300"}>
                    {log.level === "ERROR" ? "🔴" : log.level === "WARN" ? "🟡" : "📘"} {log.level}
                  </span>{" "}
                  <span className={log.level === "ERROR" ? "text-red-300" : log.level === "WARN" ? "text-amber-200" : "text-slate-200"}>
                    {log.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground text-center">
          🛡️ 基于 Web Crypto API 实现 AES-128/192/256-CBC · 完全本地运算 ·
          密文格式 [FLAG][密钥ID]#[BASE64_CIPHER]=$=
        </div>
      </div>

      {/* 密钥组管理 Modal */}
      {keyManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-lg w-[820px] max-w-[94vw] max-h-[88vh] flex flex-col shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" /> 密钥组管理（每组含多对 密钥ID/Key/IV）
              </h3>
              <button onClick={() => setKeyManagerOpen(false)} className="p-1.5 rounded hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md p-2">
                <strong>密钥组</strong>用于按国家/区域分类存储（如 德国/英国/澳洲），可配置任意多组；每组内可有多对
                <strong>密钥ID/Key/IV</strong>（密钥ID 组内唯一，正整数）。加密时密文只嵌入密钥ID。组名不能包含 # 或 =。
              </div>

              {draftStore.map((group) => (
                <div
                  key={group.name}
                  className="bg-secondary/20 border border-border rounded-lg p-3 space-y-2"
                >
                  {/* 组头 */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">密钥组:</span>
                      <input
                        key={`g-${group.name}-${draftVersion}`}
                        defaultValue={group.name}
                        onBlur={(e) => renameDraftGroup(group.name, e.target.value)}
                        placeholder="如 德国"
                        className="w-[180px] h-8 rounded-md border border-border bg-background px-2 text-sm font-semibold"
                      />
                      <span className="text-[11px] text-muted-foreground">({group.keys.length} 个密钥)</span>
                    </div>
                    <button
                      onClick={() => deleteDraftGroup(group.name)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 border border-red-200 dark:border-red-900/50 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-3 h-3" /> 删除组
                    </button>
                  </div>

                  {/* 组内密钥列表 */}
                  {group.keys.map((k) => (
                    <div key={k.id} className="border-t border-border/50 pt-2 mt-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold w-16 shrink-0">密钥ID:</span>
                        <input
                          key={`k-${group.name}-${k.id}-${draftVersion}`}
                          type="number"
                          defaultValue={k.id}
                          onBlur={(e) => updateDraftKeyId(group.name, k.id, e.target.value)}
                          className="w-24 h-7 rounded-md border border-border bg-background px-2 text-xs font-semibold"
                        />
                        <button
                          onClick={() => deleteDraftKey(group.name, k.id)}
                          className="px-2 py-1 text-[11px] text-red-500 border border-red-200 dark:border-red-900/50 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3 h-3 inline" /> 删除
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-16 shrink-0 text-muted-foreground">Key</span>
                        <input
                          type="text"
                          value={k.keyHex}
                          onChange={(e) => updateDraftKeyHex(group.name, k.id, e.target.value)}
                          placeholder="64/48/32 位十六进制"
                          className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-[11px] font-mono"
                        />
                        <button
                          onClick={() => genDraftKey(group.name, k.id)}
                          className="text-[11px] text-primary hover:underline whitespace-nowrap"
                        >
                          🎲 Key
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-16 shrink-0 text-muted-foreground">IV</span>
                        <input
                          type="text"
                          value={k.ivHex}
                          onChange={(e) => updateDraftIvHex(group.name, k.id, e.target.value)}
                          placeholder="32 位十六进制"
                          className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-[11px] font-mono"
                        />
                        <button
                          onClick={() => genDraftIv(group.name, k.id)}
                          className="text-[11px] text-primary hover:underline whitespace-nowrap"
                        >
                          🎲 IV
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => addDraftKey(group.name)}
                    className="w-full py-1.5 mt-1 border border-dashed border-border rounded text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="w-3 h-3 inline mr-1" /> 添加密钥
                  </button>
                </div>
              ))}

              <button
                onClick={addDraftGroup}
                className="w-full py-2.5 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="w-4 h-4 inline mr-1" /> 添加新密钥组
              </button>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setKeyManagerOpen(false)}
                className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary"
              >
                取消
              </button>
              <button
                onClick={saveKeys}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90"
              >
                <RefreshCw className="w-3 h-3" /> 保存并生效
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
