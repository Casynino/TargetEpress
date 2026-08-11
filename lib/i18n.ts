import type { Locale } from "@/lib/locale";

/**
 * The interface, in Chinese.
 *
 * Keyed by the English string rather than by an invented code. `t(locale,
 * "Receive Cargo")` reads at the call site as the thing it renders, so a
 * screen is still legible to whoever edits it next, and a string that has no
 * translation yet falls through to English instead of showing a bare key like
 * `nav.receive_cargo` to a warehouse.
 *
 * The trade is that changing English copy silently drops its translation. That
 * is the right way round here: an untranslated English label is a small
 * annoyance, and a Chinese label that still says what the English used to say
 * is a wrong instruction on a warehouse floor.
 *
 * Scoped on purpose. This covers what the Guangzhou desk actually touches —
 * its navigation, its screens, the words on the buttons it presses — not all
 * 95 screens of a system whose other four departments work in English.
 */

const ZH: Record<string, string> = {
  // --- navigation ----------------------------------------------------------
  Home: "首页",
  Search: "搜索",
  Requests: "客户申请",
  "Receive Cargo": "收货登记",
  "Receive & verify": "收货核对",
  Batches: "批次",
  Shipments: "运单",
  Customers: "客户",
  "Issues & Claims": "问题与索赔",
  Reports: "报表",
  Cargo: "货物",
  Support: "客服",
  "Cargo operations": "货物操作",
  "Scan & release": "扫码放货",
  Profile: "个人资料",
  "Sign out": "退出登录",
  "Main site": "官网",
  Notifications: "通知",
  "Open navigation": "打开菜单",

  // --- the registration screen, the one used most --------------------------
  "Receive cargo": "收货登记",
  "Register cargo": "登记货物",
  "New shipment": "新建运单",
  Customer: "客户",
  "Customer name": "客户姓名",
  "Phone number": "电话号码",
  Description: "货物名称",
  "Cargo description": "货物名称",
  "What is in the box?": "箱内是什么？",
  Weight: "重量",
  "Weight (kg)": "重量（公斤）",
  Packages: "件数",
  Quantity: "数量",
  "Internal notes": "内部备注",
  Notes: "备注",
  Origin: "起运地",
  Guangzhou: "广州",
  "Hong Kong": "香港",
  "Dar es Salaam": "达累斯萨拉姆",
  Photo: "照片",
  Photos: "照片",
  "Take photo": "拍照",
  "Choose file": "选择文件",

  // --- the registration form, section by section ---------------------------
  "1. Customer": "1. 客户",
  "2. What is the cargo?": "2. 货物是什么？",
  "3. Weight and packages": "3. 重量与件数",
  "4. Photos": "4. 照片",
  "Find a customer": "查找客户",
  "New customer": "新客户",
  "Cargo category": "货物类别",
  "Normal goods": "普通货物",
  Electronics: "电子产品",
  "Liquid & special goods": "液体及特殊货物",
  "Not listed / mixed": "未列出／混装",
  "Counted as": "计数单位",
  "How many": "件数",
  Cartons: "纸箱",
  Boxes: "箱",
  Pieces: "件",
  Bags: "袋",
  Envelopes: "信封",
  Other: "其他",
  "Receiving photos": "收货照片",
  "What is actually in the boxes": "箱内实际货物",
  "Shipment registered": "运单已登记",
  "Register another": "再登记一件",
  "Departs Guangzhou Airport": "从广州机场发出",
  "Departs Hong Kong Airport": "从香港机场发出",
  "Record what arrived. The system works out the route, the batch and the price.":
    "登记到货货物。系统自动判断航线、批次和价格。",

  // --- actions -------------------------------------------------------------
  Save: "保存",
  "Save changes": "保存修改",
  Cancel: "取消",
  Edit: "编辑",
  Delete: "删除",
  Print: "打印",
  "Download PDF": "下载 PDF",
  Confirm: "确认",
  Back: "返回",
  Next: "下一步",
  Close: "关闭",
  Add: "添加",
  Remove: "移除",
  Submit: "提交",
  Loading: "加载中",
  "Try again": "重试",

  // --- cargo status, as the floor says it ----------------------------------
  "Ready to depart": "待发运",
  "In transit": "运输中",
  "Received at Dar warehouse": "已到达达累斯萨拉姆仓库",
  "Ready for pickup": "可提货",
  "Under investigation": "调查中",
  Delivered: "已交付",
  Cancelled: "已取消",

  // --- labels seen across the screens --------------------------------------
  "Tracking number": "运单号",
  Consignee: "收货人",
  Contents: "货物内容",
  Batch: "批次",
  Registered: "登记日期",
  Status: "状态",
  Total: "合计",
  Today: "今天",
  "This week": "本周",
  Nothing: "无",
  None: "无",
  All: "全部",
};

const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en: {},
  zh: ZH,
};

/**
 * The interface string for this reader.
 *
 * Falls through to the English it was given, so an untranslated screen is a
 * working English screen rather than a broken Chinese one.
 */
export function t(locale: Locale, text: string): string {
  if (locale === "en") return text;
  return DICTIONARIES[locale][text] ?? text;
}

/** How much of a set of strings this locale actually covers, for a coverage check. */
export function translatedShare(locale: Locale, strings: string[]) {
  if (locale === "en") return 1;
  const dict = DICTIONARIES[locale];
  const hit = strings.filter((s) => dict[s]).length;
  return strings.length === 0 ? 1 : hit / strings.length;
}
