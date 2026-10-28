/** 模板状态机：draft → pending_review →（人工审核）→ published ⇄ offline；rejected 退回草稿侧；banned 由投诉/风控触发 */
export enum TemplateStatus {
  Draft = 'draft',
  PendingReview = 'pending_review',
  Rejected = 'rejected',
  Published = 'published',
  Offline = 'offline',
  Banned = 'banned',
}

/** 资源格式（不支持视频模板，PRD §3.3） */
export enum TemplateFormat {
  Ppt = 'ppt',
  Word = 'word',
  Excel = 'excel',
  Pdf = 'pdf',
  Image = 'image',
  Archive = 'archive',
  Other = 'other',
}

/** 多维分类维度（PRD §3.3） */
export enum CategoryDimension {
  Format = 'format',
  Scene = 'scene',
  Audience = 'audience',
  Theme = 'theme',
}

/** 网盘平台（沿用 wallpaper-manager 登录态方式） */
export enum NetdiskType {
  Quark = 'quark',
  Baidu = 'baidu',
}

/** 积分流水类型（PRD §4.7 / §9） */
export enum CreditLedgerType {
  Recharge = 'recharge',
  Gift = 'gift',
  Checkin = 'checkin',
  ShareReward = 'share_reward',
  UnlockDeduct = 'unlock_deduct',
  AdminAdjust = 'admin_adjust',
  RefundDeduct = 'refund_deduct',
}

/** 支付订单状态 */
export enum PaymentOrderStatus {
  Created = 'created',
  Paid = 'paid',
  Closed = 'closed',
  Refunded = 'refunded',
}

/** 用户状态 */
export enum UserStatus {
  Active = 'active',
  Banned = 'banned',
}

/** 投诉类型（举报与版权投诉统一入口） */
export enum ComplaintType {
  Copyright = 'copyright',
  Violation = 'violation',
  Other = 'other',
}

export enum ComplaintStatus {
  Pending = 'pending',
  Processing = 'processing',
  Resolved = 'resolved',
  Rejected = 'rejected',
}

/** 异步任务 */
export enum ProcessingTaskType {
  AiClassify = 'ai_classify',
  Thumbnail = 'thumbnail',
  LinkCheck = 'link_check',
  HeatScore = 'heat_score',
}

export enum ProcessingTaskStatus {
  Queued = 'queued',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  RetryWaiting = 'retry_waiting',
}

export enum AdminRole {
  Super = 'super',
  Operator = 'operator',
}

export enum FeedbackStatus {
  Pending = 'pending',
  Resolved = 'resolved',
}

export enum AnnouncementPosition {
  Home = 'home',
  Mine = 'mine',
}

/** 系统配置 Key（PRD §4.9），值统一存 JSON */
export const SYSTEM_CONFIG_KEYS = {
  monetizationEnabled: 'monetizationEnabled',
  virtualPayEnabled: 'virtualPayEnabled',
  checkinEnabled: 'checkinEnabled',
  checkinRewardEnabled: 'checkinRewardEnabled',
  shareRewardEnabled: 'shareRewardEnabled',
  searchEnabled: 'searchEnabled',
  favoriteEnabled: 'favoriteEnabled',
  shareEnabled: 'shareEnabled',
  copyrightDisclaimer: 'copyrightDisclaimer',
  termsVersion: 'termsVersion',
  privacyPolicyVersion: 'privacyPolicyVersion',
  homeSections: 'homeSections',
  hotKeywords: 'hotKeywords',
  heatWeights: 'heatWeights',
} as const;

export type SystemConfigKey = (typeof SYSTEM_CONFIG_KEYS)[keyof typeof SYSTEM_CONFIG_KEYS];

/** 排序白名单（列表接口只允许这些值，PRD §10） */
export const TEMPLATE_SORT_WHITELIST = ['comprehensive', 'latest', 'hot', 'favorites'] as const;
export type TemplateSort = (typeof TEMPLATE_SORT_WHITELIST)[number];

/** 热度分默认权重：view×1 + favorite×8 + shareOpen×2（PRD §3.3） */
export const DEFAULT_HEAT_WEIGHTS = { view: 1, favorite: 8, shareOpen: 2 } as const;

/** 分享奖励默认规则（PRD §3.5） */
export const DEFAULT_SHARE_REWARD = { credits: 5, dailyLimit: 10, minStaySeconds: 5 } as const;
