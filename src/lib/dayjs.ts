import dayjs from 'dayjs';
import 'dayjs/locale/zh-tw';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// 行程時間一律存「當地時間 + IANA 時區」並以當地時間顯示（ADR 0004）。
// 專案內一律從這裡 import dayjs，確保 plugin 已載入。
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.locale('zh-tw');

export default dayjs;
