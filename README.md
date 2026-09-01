# fire-petition-reply-templates

火災預防陳情案件回覆範本庫（改善版）。

參考 https://fire-petition-replies.cpukuso.chatgpt.site/ 原型工具重新建置，改善方向：
1. 法規版本追蹤 — 範本與法條關聯，法規異動時反查需覆核的範本
2. 送出前必填檢核 — 擋掉範本佔位符沒填就送出
3. 使用紀錄留存 — 記錄誰用了哪個範本回了哪個案子，分析常被大改的範本
4. 智慧分類輔助 — AI協助判斷陳情類別（視需要，非必要）

架構：GitHub Pages 前端 + Google Apps Script 後端（Google Sheet 存範本/法規/使用紀錄）。
