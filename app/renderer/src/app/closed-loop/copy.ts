import { truncateGraphemes } from '@clarityokr/contracts';
/**
 * zh-CN copy for the closed-loop UI (spec v2.7 §3.13, §4.8). Kept in one module so the wording
 * can be checked against the design spec in one place; interpolated strings are functions.
 */
import type { KrStatus } from '@clarityokr/contracts';

export const STATUS_LABEL: Record<KrStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  at_risk: '有风险',
  done: '已完成',
};

export const STATUS_ICON: Record<KrStatus, string> = {
  not_started: '○',
  in_progress: '◐',
  at_risk: '△',
  done: '✓',
};

export const STATUS_ORDER: readonly KrStatus[] = ['not_started', 'in_progress', 'at_risk', 'done'];

export const COPY = {
  edit: {
    action: '编辑文字',
    formLabel: '编辑文字',
    explain: '字数按字符计，一个 emoji 算 1 个字符。',
    progressNote: '进度与状态请在编辑完成后更新。',
    objective: '目标',
    keyResult: (n: number) => `关键结果 ${n}`,
    metric: (n: number) => `关键结果 ${n} 的度量`,
    metricShort: '度量（怎样算 0–100%）',
    metricPlaceholder: '例如：每周正式发布次数（0% = 每周 1 次，100% = 每周 3 次）',
    krPlaceholder: '写下一个可衡量的关键结果',
    undo: '撤销',
    redo: '重做',
    undoTitle: '撤销文字修改（Ctrl/⌘+Z）',
    redoTitle: '重做文字修改（Ctrl/⌘+Shift+Z）',
    cancel: '取消',
    save: '保存',
    saving: '正在保存…',
    saved: '文字已保存。',
    objectiveEmpty: '目标不能为空。',
    krEmpty: '关键结果不能为空。',
    needFill: '还有内容没有填写，暂时不能保存。',
    saveFailed: '没能保存，你写的内容还在。',
    saveOverLimit: '没能保存：内容超出字数上限。',
    maxKrs: '最多 10 条关键结果',
    discardTitle: '放弃未保存的修改？',
    discardBody: '你修改的文字还没有保存。',
    keepEditing: '继续编辑',
    discard: '放弃',
  },
  limit: {
    over: (n: number) => `超出 ${n} 个字符，请删减后再保存。`,
    cluster: '内容里的特殊符号过多，请删减后再保存。',
    countLabel: (n: number, limit: number) =>
      `已输入 ${n} 个字符，上限 ${limit}；一个 emoji 算 1 个字符`,
    overAlert: (name: string, k: number) => `${name}超出 ${k} 个字符。`,
    clusterAlert: (name: string) => `${name}里的特殊符号过多。`,
    backInRange: (name: string) => `${name}已在字数范围内。`,
  },
  review: {
    contextNoPeriod: '未设置周期',
    stateNever: '还没有复盘',
    stateSaved: (time: string, memory = false) =>
      memory ? `已保存（仅本次运行）· ${time}` : `已保存 · ${time}`,
    stateDirty: '有未保存的修改',
    snapshotHeading: '各关键结果进度',
    snapshotPending: '保存时会固化为快照',
    snapshotSaved: (time: string) => `快照 · ${time}`,
    snapshotNote: '之后的进度变化不会改动这里。',
    drift: '便签上的关键结果之后有更新（进度、状态、文字或度量），这里保持保存时的快照。',
    driftGo: '去便签查看',
    unfilled: (n: number) => `有 ${n} 个关键结果还没填写进度，快照里会记为「—」。`,
    emptyKrs: '这条 OKR 还没有关键结果，没有进度可记录。',
    overall: (value: number | null) => (value === null ? '整体进度 —' : `整体进度 ${value}%`),
    noMetric: '未设置度量',
    metricPrefix: '度量：',
    removedTag: '已移除',
    colIndex: '序号',
    colKr: '关键结果',
    colProgress: '进度',
    colStatus: '状态',
    tableLabel: '关键结果进度快照',
    sections: [
      {
        key: 'wentWell',
        label: '做得好',
        placeholder: '例如：这个周期里哪些事比预期顺利？',
      },
      {
        key: 'fellShort',
        label: '没做到',
        placeholder: '例如：哪些目标没有达到，原因是什么？',
      },
      {
        key: 'nextSteps',
        label: '下一步',
        placeholder: '例如：下个周期最先做的一件事是什么？',
      },
    ],
    sectionHint: (n: number) => `这是复盘的第 ${n} 段，共 3 段`,
    save: '保存复盘',
    needOne: '请至少填写一段',
    savingStatus: '正在保存复盘…',
    savedToast: '复盘已保存。',
    savedToastMemory: '复盘已保存（仅本次运行）。',
    savedLive: (time: string) => `复盘已保存，进度快照为 ${time} 时的状态。`,
    saveFailed: '没能保存复盘，你写的内容还在。',
    retry: '重试',
    loadFailed: '没能读取复盘。',
    loading: '正在读取复盘…',
    leaveTitle: '放弃未保存的复盘修改？',
    leaveBody: '你写的内容还没有保存。',
    leaveSaving: '正在保存，请稍候。',
    keepEditing: '继续编辑',
    leave: '放弃修改',
    saveOverLimit: '没能保存：内容超出字数上限。',
    contentLabel: '复盘',
  },
  addShort: '添加',
  tabs: { note: '便签', review: '复盘', history: '历史', tablistLabel: '页面切换' },
  overall: {
    label: '整体进度',
    none: '还没有填写进度',
    summary: (total: number, filled: number) => `${total} 个关键结果中 ${filled} 个已填写进度`,
    barLabel: '整体进度',
    valueText: (value: number | null) => (value === null ? '整体进度未填写' : `整体进度 ${value}%`),
  },
  period: {
    none: '不设置周期',
    noneOption: '不设置',
    current: '当前季度',
    label: '周期',
    set: (period: string) => `周期已设为 ${period}。`,
    cleared: '已取消周期。',
    failed: '没能保存周期，请重试。',
  },
  pin: {
    notPinned: '这不是置顶便签。',
    action: '设为置顶便签',
    done: '已设为置顶便签，下次打开会先显示这一条。',
    failed: '没能设为置顶便签，请重试。',
    retry: '重试',
  },
  kr: {
    heading: (count: number) => `关键结果 ${count}`,
    metricPrefix: '度量：',
    addMetric: '添加度量',
    addMetricLabel: (n: number) => `添加度量，关键结果 ${n}`,
    removedHeading: (count: number) => `已移除的关键结果（${count}）`,
    removedNote: '已移除的关键结果不计入整体进度。',
    removedTag: (date: string) => `已移除 · ${date}`,
    lastProgress: (value: number | null, status: string) =>
      `最后进度 ${value === null ? '—' : `${value}%`} · ${status}`,
    empty: '还没有关键结果',
    notFilled: '—',
    notFilledSpoken: '未填写',
    editValueLabel: (n: number, value: number | null) =>
      `编辑进度，关键结果 ${n}，当前${value === null ? '未填写' : ` ${value}%`}`,
    inputLabel: (n: number) => `关键结果 ${n} 进度百分比，0 到 100 的整数`,
    statusLabel: (n: number, status: KrStatus) =>
      `关键结果 ${n} 状态，当前${STATUS_LABEL[status]}，更改`,
    barLabel: (n: number) => `关键结果 ${n} 进度`,
    barText: (value: number | null, status: KrStatus) =>
      value === null ? '未填写' : `${value}%，${STATUS_LABEL[status]}`,
    editLast: '修改这次',
    revertLast: '撤回这次',
    editLastLabel: (n: number) => `修改这次，关键结果 ${n}`,
    revertLastLabel: (n: number) => `撤回这次，关键结果 ${n}`,
    revertDisabledReason: '已撤回的更新不能再次撤回，请先更新进度。',
    saveFailed: '没能保存，进度没有改动。',
    stale: '这个关键结果刚在别处有改动，已刷新为最新状态，请再试一次。',
    retry: '重试',
    discard: '放弃修改',
    doneNot100: (value: number | null) =>
      value === null
        ? '状态是「已完成」，但进度还没填写。'
        : `状态是「已完成」，但进度是 ${value}%。`,
    doneNot100Spoken: (n: number) => `关键结果 ${n}：状态是已完成，但进度不是 100。`,
    setTo100: '改为 100%',
    setTo100Label: (n: number) => `把关键结果 ${n} 的进度改为 100%`,
    progressUpdated: (n: number, value: number | null) =>
      value === null ? `关键结果 ${n} 进度已清空。` : `关键结果 ${n} 进度已更新为 ${value}%。`,
    statusUpdated: (n: number, status: KrStatus) =>
      `关键结果 ${n} 状态已改为${STATUS_LABEL[status]}。`,
    reverted: (n: number, value: number | null, status: KrStatus) =>
      `已撤回关键结果 ${n} 的上一次进度更新，进度恢复为${
        value === null ? '未填写' : ` ${value}%`
      }，状态恢复为${STATUS_LABEL[status]}。`,
    saving: '正在保存…',
  },
  progressErrors: {
    belowMin: '进度不能小于 0',
    aboveMax: '进度不能超过 100',
    notNumber: '请输入 0–100 的整数',
    decimal: '请输入整数，不要带小数点',
  },
  history: {
    heading: (count: number) => `全部 OKR · ${count}`,
    listLabel: 'OKR 列表',
    searchPlaceholder: '搜索目标…',
    searchLabel: '搜索 OKR 目标',
    clearSearch: '清除搜索',
    searchFound: (count: number) => `找到 ${count} 个 OKR`,
    noMatch: (keyword: string) => `没有找到包含「${keyword}」的 OKR。`,
    openNow: '当前打开',
    periodLabel: '周期 ',
    overallLabel: '整体进度 ',
    overallNotFilled: '整体进度未填写',
    pinned: '置顶',
    reviewed: '已复盘',
    allDone: '全部完成',
    updatedAt: (time: string) => `更新于 ${time}`,
    krCount: (count: number) => `${count} 个关键结果`,
    emptyTitle: '还没有 OKR',
    emptyBody: '你创建的每一个 OKR 都会保存在这里，随时可以找回。',
    loadFailed: '没能读取 OKR 列表。',
    retry: '重试',
    openFailed: '没能打开这条 OKR，请重试。',
    blockedBusy: '正在重新生成，完成后可切换。',
    blockedEditing: '正在编辑文字，保存或取消后可切换。',
  },
  import: {
    button: '导入…',
    buttonLabel: '导入 OKR',
    emptyButton: '从文件导入…',
    reading: '正在读取文件…',
    importing: '正在导入…',
    locked: '正在重新生成，完成后可用',
    cancelled: '已取消导入，没有改动数据。',
    skipped: (title: string) => `已跳过「${title}」，没有改动数据。`,
    imported: (count: number, memory: boolean) =>
      `已导入 ${count} 个 OKR${memory ? '，退出后会丢失。' : ''}`,
    view: '查看',
    newTag: '新导入',
    unchanged: '数据没有任何改动。',
    ok: '知道了',
    reselect: '重新选择文件…',
    retry: '重试',
    cancel: '取消',
    skip: '跳过',
    asCopy: '作为副本导入',
    confirm: '导入',
    memoryWarning: '当前数据不会保存，退出后导入的内容也会丢失。',
    confirmTitle: (count: number) => `导入 ${count} 个 OKR？`,
    confirmBody: (title: string) => `将导入「${title}」。`,
    conflictTitle: '这个 OKR 已经存在',
    conflictBody: (title: string, createdAt: string) =>
      `历史里已有一个同名、同一创建时间的 OKR：「${title}」（创建于 ${createdAt}）。导入不会覆盖它。`,
    conflictHint: '作为副本导入时，新 OKR 的标题会加上「（导入）」。',
    tooLargeTitle: '文件太大，无法导入',
    tooLargeBody: (mb: string) => `只能导入 5 MB 以内的文件，这个文件有 ${mb} MB。`,
    notJsonTitle: '这不是可以导入的文件',
    notJsonBody: '文件内容不是有效的 JSON。请选择 ClarityOKR 导出的 .json 文件。',
    invalidTitle: '文件内容有误，无法导入',
    invalidBody: '第一处错误：',
    invalidMore: (n: number) => `另有 ${n} 处错误`,
    versionTitle: '这个文件的版本不受支持',
    versionBody: (v: string) => `这个文件的格式版本是 ${v}，当前只能导入版本 1 的文件。`,
    readTitle: '没能读取这个文件',
    read: {
      permission: '没有权限读取这个文件。',
      not_found: '文件不存在或已被移动。',
      busy: '这个文件正在被其他程序使用。',
      other: '读取文件时出错，请重试。',
    },
    missingBody: '找不到原文件，请重新选择。',
    writeTitle: '导入没有完成',
    write: {
      disk_full: '磁盘已满，导入没有完成。',
      busy: '数据正被占用，导入没有完成，请稍后重试。',
      other: '导入时出错，请重试。',
    },
    rolledBack: '已撤销这次导入，没有留下不完整的数据。',
    failed: '导入时出错，请重试。',
    // #50 backup import (S1§9.4; Q9-3: 「个」 everywhere)
    emptyBackupTitle: '备份中没有 OKR',
    emptyBackupBody: '这个备份文件里没有任何 OKR，没有可导入的内容。数据没有任何改动。',
    backupInvalidBody: (n: number) => `备份里第 ${n} 个 OKR 有误，整份没有导入。第一处错误：`,
    backupTitle: '导入备份？',
    backupBody: (n: number, at: string, version: string) =>
      `这个备份包含 ${n} 个 OKR，备份于 ${at}（ClarityOKR ${version}）。导入不会覆盖已有数据。`,
    backupAllNew: (n: number) => `${n} 个都是新的，会全部导入。`,
    backupDuplicates: (d: number) => `其中 ${d} 个和历史里已有的 OKR 同名且创建时间相同：`,
    backupImportN: (n: number) => `导入 ${n} 个`,
    backupStart: '开始导入',
    skipAll: '全部跳过',
    copyAll: '全部作为副本',
    optionSkip: '跳过',
    optionCopy: '作为副本',
    duplicatesLabel: '重复的 OKR',
    inFileTag: '文件内重复',
    createdAt: (at: string) => `创建于 ${at}`,
    backupSummary: (a: number, s: number) => `将导入 ${a} 个，跳过 ${s} 个。`,
    backupAllSkipped: '所有项都选了跳过，没有要导入的内容。',
    backupImported: (a: number, s: number, memory: boolean) =>
      (s === 0 ? `已导入 ${a} 个 OKR。` : `导入 ${a} 个，跳过 ${s} 个。`) +
      (memory ? '退出后会丢失。' : ''),
  },
  backup: {
    menu: '全部备份…',
    menuHint: '所有 OKR、进度记录和复盘，.json',
    disabled: '正在重新生成，完成后可用',
    backingUp: '正在备份…',
    cancelled: '已取消备份，没有保存文件。',
    saved: (n: number, fileName: string) =>
      n === 0 ? `已备份：${fileName}（目前没有 OKR）` : `已备份 ${n} 个 OKR：${fileName}`,
    /** Q9-4 */
    noSecrets: '备份不含 API key，恢复后需要重新填写。',
    failed: {
      permission: '没有权限保存到这个位置，请换一个文件夹。',
      disk_full: '磁盘已满，备份没有保存成功。',
      not_found: '保存位置不存在或暂时不可用，请换一个文件夹。',
      busy: '这个文件正在被其他程序使用，备份没有保存成功。',
      exists: '同名文件已存在，请换个名字再备份',
      other: '备份失败，请重试。',
    },
  },
  export: {
    topBarTitle: 'ClarityOKR',
    button: '导出',
    menuLabel: '导出',
    markdown: '导出为 Markdown…',
    markdownHint: '便于阅读，.md 文件',
    json: '导出为 JSON…',
    jsonHint: '数据文件，.json，含全部进度记录',
    copyMarkdown: '复制为 Markdown',
    copyMarkdownHint: '复制到剪贴板',
    disabledNoOkr: '没有可导出的内容',
    disabledRegenerating: '正在重新生成，完成后可导出',
    exporting: '正在导出…',
    /** 「已导出「{标题}」为 Markdown：{文件名}」; the title is cut after 16 characters (…). */
    saved: (format: 'md' | 'json', fileName: string, title?: string): string => {
      const kind = format === 'md' ? 'Markdown' : 'JSON';
      const name = title ? truncateTitle(title) : '';
      return name ? `已导出「${name}」为 ${kind}：${fileName}` : `已导出为 ${kind}：${fileName}`;
    },
    reveal: '在文件夹中显示',
    copyPath: '复制路径',
    pathCopied: '已复制',
    pathCopyFailed: '复制失败',
    pathCopiedLive: '路径已复制。',
    revealFailed: '没能在文件夹中显示这个文件。',
    cancelled: '已取消导出，没有保存文件。',
    pickAgain: '重新选择位置',
    retry: '重试',
    close: '关闭',
    failed: {
      permission: '没有权限保存到这个位置，请换一个文件夹。',
      disk_full: '磁盘已满，没有保存成功。',
      not_found: '保存位置不存在或暂时不可用，请换一个文件夹。',
      busy: '这个文件正在被其他程序使用，没有保存成功。',
      exists: '同名文件已存在，请换个名字再导出。',
      other: '导出失败，请重试。',
    },
    copied: '已复制到剪贴板。',
    copyFailed: '没能复制到剪贴板。',
  },
  /** §7 旧库通知、§7a 存储提示 (no path, never the word 「备份」, no API key). */
  storage: {
    legacyTitle: '已升级到新的数据格式',
    legacyLead: '旧数据已保留，不会自动导入。',
    legacyBody:
      '你之前创建的 OKR 没有丢失，旧的数据库文件已改名保留。这一版从一个空白的库开始，需要的话可以重新创建。',
    legacyAck: '知道了',
    legacyAckBusy: '正在保存…',
    legacyAckFailed: '没有保存成功，请再点一次「知道了」。',
    legacyAcked: '已确认。',
    freshTitle: '旧数据没有载入',
    freshBody: '旧数据没有载入，之后的内容会保存在新文件里。',
    freshBody2: '需要的话可以重新创建 OKR。',
    freshAck: '知道了',
    memoryTitle: '数据无法保存',
    memoryBody:
      '本次运行的内容只存在内存里，关闭应用后会丢失。请先导出当前 OKR，或重启应用后再试。',
    memoryExport: '导出当前 OKR',
    memoryRestart: '重启应用',
    relaunchFailed: '重启没有成功，请手动关闭后重新打开应用',
  },
  /** §1.2c 重启版确认 */
  restart: {
    title: '重启 ClarityOKR？',
    reasons: {
      wizard: '向导里已经填写的内容还没有保存，重启会丢掉这些内容。',
      text_edit: '你对关键结果文字的修改还没有提交，重启会丢掉这些修改。',
      review_draft: '复盘里写的内容还没有保存，重启会丢掉这些内容。',
      memory_data: '重启后本次运行的内容会丢失。',
    },
    notNow: '先不重启',
    keepEditing: '继续编辑',
    confirm: '放弃并重启',
  },
  /** §1.2c: the quit / restart answer was not taken (reject, ok:false or 5 s timeout). */
  exitAnswerFailed: '没能完成这次操作，请再试一次。',
  /** §3.7 重新生成 */
  regen: {
    button: '重新生成',
    /** §3.7 v2.9: tooltip on the controls locked while generating. */
    lockedTooltip: '正在重新生成，完成后可用',
    menuLabel: '重新生成',
    selectSome: '重新生成选中的关键结果…',
    all: '重新生成全部关键结果…',
    selectLabel: (n: number, text: string) => `选择第 ${n} 条关键结果：${text}`,
    selectedCount: (n: number) => `已选 ${n} 条`,
    cancel: '取消',
    regenerateSelected: '重新生成所选',
    selectAtLeastOne: '请至少选一条',
    confirmTitleSome: (n: number) => `重新生成所选的 ${n} 条关键结果？`,
    confirmTitleAll: '重新生成全部关键结果？',
    confirmBodySome: (n: number) =>
      `会改写这 ${n} 条的文字和度量。能对应上原条目的，进度、状态和复盘都会保留，请在完成后确认进度是否仍然准确。`,
    confirmBodyAll:
      '会改写所有关键结果的文字和度量。能对应上原条目的，进度、状态和复盘都会保留，请在完成后确认进度是否仍然准确；对应不上的会被标为「已移除」，它们的进度记录仍留在历史里，但不会自动恢复。已保存的复盘不会改变。',
    confirm: '重新生成',
    running: '正在重新生成关键结果…',
    newTag: '新增',
    gotIt: '知道了',
    viewRemoved: '查看已移除',
    retry: '重试',
    details: '查看详情',
    updated: (n: number) =>
      `已重新生成 ${n} 条关键结果：文字和度量已更新，进度和状态保留。请确认进度是否仍然准确。`,
    reordered: '顺序已调整，进度和状态跟着各条关键结果保留。请确认进度是否仍然准确。',
    changedMain: (k: number, a: number, r: number) =>
      `重新生成完成：保留 ${k} 条，新增 ${a} 条，移除 ${r} 条。`,
    changedConfirm: '请确认进度是否仍然准确。',
    changedMissing: (k: number, m: number, r: number) =>
      `保留的 ${k} 条文字和度量已更新，进度和状态保留，请确认进度是否仍然准确。其中 ${m} 条没有返回编号，已按新增处理，原有 ${r} 条移到了「已移除」，它们的进度记录仍在历史里。`,
    partialUpdated: (n: number) =>
      `已重新生成所选的 ${n} 条关键结果：文字和度量已更新，进度和状态保留。请确认进度是否仍然准确。`,
    partialRemoved: (n: number, r: number) =>
      `所选 ${n} 条中有 ${r} 条没有返回，已移到「已移除」，进度记录仍在历史里。其余已更新的请确认进度是否仍然准确。`,
    failed: '重新生成失败，原来的关键结果没有改动。',
    failedDetail: (code: string) => `错误代码：${code}`,
  },
  /** §1.2c 退出确认 */
  quit: {
    title: '退出 ClarityOKR？',
    reasons: {
      wizard: '向导里已经填写的内容还没有保存，退出会丢掉这些内容。',
      text_edit: '你对关键结果文字的修改还没有提交，退出会丢掉这些修改。',
      review_draft: '复盘里写的内容还没有保存，退出会丢掉这些内容。',
      memory_data: '本次运行的内容没有保存到文件，退出后会全部丢失。',
    },
    notNow: '先不退出',
    keepEditing: '继续编辑',
    confirm: '放弃并退出',
  },
  /** §1.2 / §1.2a 便签顶栏：「⋯」与「隐藏」 */
  window: {
    more: '更多',
    alwaysOnTop: '窗口始终在最前',
    hide: '隐藏便签',
    hideTooltip: '隐藏便签（应用仍在运行，不是退出）',
    /** N15 (§1.2a): Windows / Linux, no tray icon, last visible window. */
    hideQuitsTooltip: '退出 ClarityOKR（没有托盘图标，隐藏后无法唤回）',
  },
  /** §4.5a 新建 OKR */
  newOkr: {
    button: '新建 OKR',
    confirmTitle: '重新开始一个新的 OKR？',
    confirmBody: '向导里已经填写的内容还没有保存，重新开始会丢掉这些内容。',
    keep: '继续当前向导',
    restart: '重新开始',
  },
  note: {
    loadFailed: '没能读取这条 OKR。',
    retry: '重试',
    emptyTitle: '还没有 OKR',
    emptyBody: '告诉 ClarityOKR 你想实现什么，回答几个问题就能生成。',
    loadingLabel: '正在读取…',
  },
} as const;

/** `今天 14:20` / `昨天 09:05` / `2026-09-28` in local time (§4.8). */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const dayKey = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayKey(now) - dayKey(date)) / 86_400_000);
  if (diffDays === 0) return `今天 ${hm}`;
  if (diffDays === 1) return `昨天 ${hm}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `10-03` style month-day for removed key results. */
/** §4.8 with minutes always: `今天 14:20` / `昨天 14:20` / `2026-09-28 14:20`. */
export function formatDateTime(iso: string, now: Date = new Date()): string {
  const relative = formatRelativeTime(iso, now);
  if (relative === '' || relative.includes(':')) return relative;
  const date = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${relative} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatMonthDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Titles longer than this many characters (grapheme clusters) are cut with 「…」 in toasts. */
export const TOAST_TITLE_MAX = 16;

/** Cuts a title to {@link TOAST_TITLE_MAX} user-perceived characters (emoji stay whole). */
export function truncateTitle(title: string, max = TOAST_TITLE_MAX): string {
  return truncateGraphemes(title.trim(), max);
}
