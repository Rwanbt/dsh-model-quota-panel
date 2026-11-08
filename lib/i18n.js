/**
 * Translations for every string the panel renders.
 *
 * `en` and `zh` are the harness baseline locales; the others fall back to `en`
 * for any missing key, so adding a language is one object here.
 *
 * Pure functions: no I/O, no Node imports.
 */

export const MESSAGES = {
  en: {
    'panel.title': 'Subscription quota',
    'panel.sessionCost': 'Session cost',
    'panel.estimate': 'estimate',
    'panel.used': 'used',
    'panel.state': 'State',
    'panel.noData': 'No quota data available',
    'panel.unavailable': 'Quota data unavailable',
    'panel.stale': 'Read at {time}',
    'panel.active': 'active',
    'window.rolling': 'Rolling window',
    'window.weekly': 'Week',
    'window.monthly': 'Month',
    'window.fiveHour': '5-hour window',
    'window.short': 'Short window',
    'window.day': '{count}-day window',
    'window.hour': '{count}-hour window',
    'window.minute': '{count}-minute window',
    'window.credit': 'Credit',
    'window.balance': 'Balance',
    'window.interval': 'Interval',
    'window.chat': 'Chat',
    'window.completions': 'Completions',
    'window.premium': 'Premium',
    'reset.in': 'resets in {duration}',
    'reset.at': 'resets at {time}',
    'reset.done': 'reset at {time}',
    'duration.daysHours': '{days} d {hours} h',
    'duration.hoursMinutes': '{hours} h {minutes} min',
    'duration.minutes': '{minutes} min',
    'reason.noWindow': 'No window returned by the provider',
    'reason.noPlan': 'No active plan on this account',
    'reason.apiKeyOnly': 'API key: the vendor exposes no quota API',
    'reason.notConnected': 'Not connected',
    'reason.httpError': 'Request failed: {message}',
    'cost.unknownModel': 'price unknown for {model}',
  },
  fr: {
    'panel.title': 'Quota d’abonnement',
    'panel.sessionCost': 'Coût de la session',
    'panel.estimate': 'estimation',
    'panel.used': 'utilisé',
    'panel.state': 'État',
    'panel.noData': 'Aucun quota disponible',
    'panel.unavailable': 'Quotas indisponibles',
    'panel.stale': 'Relevé à {time}',
    'panel.active': 'actif',
    'window.rolling': 'Fenêtre glissante',
    'window.weekly': 'Semaine',
    'window.monthly': 'Mois',
    'window.fiveHour': 'Fenêtre 5 h',
    'window.short': 'Fenêtre courte',
    'window.day': 'Fenêtre {count} j',
    'window.hour': 'Fenêtre {count} h',
    'window.minute': 'Fenêtre {count} min',
    'window.credit': 'Crédit',
    'window.balance': 'Solde',
    'window.interval': 'Intervalle',
    'window.chat': 'Chat',
    'window.completions': 'Complétions',
    'window.premium': 'Premium',
    'reset.in': 'réinit. dans {duration}',
    'reset.at': 'réinit. à {time}',
    'reset.done': 'réinitialisé à {time}',
    'duration.daysHours': '{days} j {hours} h',
    'duration.hoursMinutes': '{hours} h {minutes} min',
    'duration.minutes': '{minutes} min',
    'reason.noWindow': 'Aucune fenêtre renvoyée par le fournisseur',
    'reason.noPlan': 'Aucun plan actif sur ce compte',
    'reason.apiKeyOnly': 'Clé API : le fournisseur n’expose pas de quota',
    'reason.notConnected': 'Non connecté',
    'reason.httpError': 'Requête refusée : {message}',
    'cost.unknownModel': 'prix inconnu pour {model}',
  },
  es: {
    'panel.title': 'Cuota de suscripción',
    'panel.sessionCost': 'Coste de la sesión',
    'panel.estimate': 'estimación',
    'panel.used': 'usado',
    'panel.state': 'Estado',
    'panel.noData': 'No hay datos de cuota',
    'panel.unavailable': 'Cuotas no disponibles',
    'panel.stale': 'Leído a las {time}',
    'panel.active': 'activo',
    'window.rolling': 'Ventana móvil',
    'window.weekly': 'Semana',
    'window.monthly': 'Mes',
    'window.fiveHour': 'Ventana de 5 h',
    'window.short': 'Ventana corta',
    'window.day': 'Ventana de {count} d',
    'window.hour': 'Ventana de {count} h',
    'window.minute': 'Ventana de {count} min',
    'window.credit': 'Crédito',
    'window.balance': 'Saldo',
    'window.interval': 'Intervalo',
    'window.chat': 'Chat',
    'window.completions': 'Completados',
    'window.premium': 'Premium',
    'reset.in': 'se restablece en {duration}',
    'reset.at': 'se restablece a las {time}',
    'reset.done': 'restablecido a las {time}',
    'duration.daysHours': '{days} d {hours} h',
    'duration.hoursMinutes': '{hours} h {minutes} min',
    'duration.minutes': '{minutes} min',
    'reason.noWindow': 'El proveedor no devolvió ninguna ventana',
    'reason.noPlan': 'No hay plan activo en esta cuenta',
    'reason.apiKeyOnly': 'Clave API: el proveedor no expone cuota',
    'reason.notConnected': 'Sin conexión',
    'reason.httpError': 'Petición fallida: {message}',
    'cost.unknownModel': 'precio desconocido para {model}',
  },
  de: {
    'panel.title': 'Abo-Kontingent',
    'panel.sessionCost': 'Sitzungskosten',
    'panel.estimate': 'Schätzung',
    'panel.used': 'verbraucht',
    'panel.state': 'Status',
    'panel.noData': 'Keine Kontingentdaten',
    'panel.unavailable': 'Kontingente nicht verfügbar',
    'panel.stale': 'Gelesen um {time}',
    'panel.active': 'aktiv',
    'window.rolling': 'Gleitendes Fenster',
    'window.weekly': 'Woche',
    'window.monthly': 'Monat',
    'window.fiveHour': '5-Stunden-Fenster',
    'window.short': 'Kurzes Fenster',
    'window.day': '{count}-Tage-Fenster',
    'window.hour': '{count}-Stunden-Fenster',
    'window.minute': '{count}-Minuten-Fenster',
    'window.credit': 'Guthaben',
    'window.balance': 'Saldo',
    'window.interval': 'Intervall',
    'window.chat': 'Chat',
    'window.completions': 'Vervollständigungen',
    'window.premium': 'Premium',
    'reset.in': 'zurückgesetzt in {duration}',
    'reset.at': 'zurückgesetzt um {time}',
    'reset.done': 'zurückgesetzt um {time}',
    'duration.daysHours': '{days} T {hours} Std',
    'duration.hoursMinutes': '{hours} Std {minutes} Min',
    'duration.minutes': '{minutes} Min',
    'reason.noWindow': 'Der Anbieter lieferte kein Fenster',
    'reason.noPlan': 'Kein aktiver Plan auf diesem Konto',
    'reason.apiKeyOnly': 'API-Schlüssel: Anbieter bietet kein Kontingent',
    'reason.notConnected': 'Nicht verbunden',
    'reason.httpError': 'Anfrage fehlgeschlagen: {message}',
    'cost.unknownModel': 'Preis für {model} unbekannt',
  },
  zh: {
    'panel.title': '订阅配额',
    'panel.sessionCost': '会话费用',
    'panel.estimate': '估算',
    'panel.used': '已用',
    'panel.state': '状态',
    'panel.noData': '暂无配额数据',
    'panel.unavailable': '配额不可用',
    'panel.stale': '读取于 {time}',
    'panel.active': '当前',
    'window.rolling': '滚动窗口',
    'window.weekly': '周',
    'window.monthly': '月',
    'window.fiveHour': '5 小时窗口',
    'window.short': '短窗口',
    'window.day': '{count} 天窗口',
    'window.hour': '{count} 小时窗口',
    'window.minute': '{count} 分钟窗口',
    'window.credit': '额度',
    'window.balance': '余额',
    'window.interval': '间隔',
    'window.chat': '对话',
    'window.completions': '补全',
    'window.premium': '高级',
    'reset.in': '{duration}后重置',
    'reset.at': '{time} 重置',
    'reset.done': '{time} 已重置',
    'duration.daysHours': '{days} 天 {hours} 小时',
    'duration.hoursMinutes': '{hours} 小时 {minutes} 分',
    'duration.minutes': '{minutes} 分',
    'reason.noWindow': '提供方未返回可用窗口',
    'reason.noPlan': '该账户没有有效套餐',
    'reason.apiKeyOnly': 'API 密钥：提供方未开放配额接口',
    'reason.notConnected': '未连接',
    'reason.httpError': '请求失败：{message}',
    'cost.unknownModel': '{model} 的价格未知',
  },
};

/** Locales the bundle can answer, in the order the picker shows them. */
export const LOCALES = ['en', 'fr', 'es', 'de', 'zh'];

/**
 * Translate one key, with `{placeholder}` substitution and an `en` fallback.
 * @param {string} locale - BCP 47 tag or primary subtag.
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @param {Record<string, Record<string, string>>} [messages]
 * @returns {string} the key itself when no translation exists anywhere.
 */
export function translate(locale, key, params, messages = MESSAGES) {
  const primary = typeof locale === 'string' ? locale.toLowerCase().split(/[-_]/)[0] : 'en';
  const template = messages?.[primary]?.[key] ?? messages?.en?.[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * Resolve the user's locale against the supported list (`fr-CA` -> `fr`).
 * @param {string|undefined} requested
 * @returns {string} a supported locale id, `en` when nothing matches.
 */
export function resolveLocale(requested) {
  if (typeof requested !== 'string' || requested === '') return 'en';
  const primary = requested.toLowerCase().split(/[-_]/)[0];
  return LOCALES.includes(primary) ? primary : 'en';
}
