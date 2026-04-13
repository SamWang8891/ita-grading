# 學生報告互評系統（ITA peer grading）

一套無需註冊的課堂互評工具，提供學生、老師、admin 三種角色。  
設計企劃見 [plan.md](plan.md)。

## 專案結構

```
ita-grading/
├─ backend/      # FastAPI + SQLite（stdlib sqlite3）
└─ frontend/     # Vite + React 19 + React Router
```

## 相依

- Python 3.9+
- Node.js 22+
- [uv](https://docs.astral.sh/uv/)（Python 套件管理，可用 `pip` 取代）

## 快速啟動（開發模式）

### 1. Backend

```bash
cd backend
cp .env.example .env            # 修改 ADMIN_PASSWORD 再繼續
uv sync --extra dev
uv run uvicorn app:app --port 8000 --reload
```

首次啟動會自動建立 `backend/.db/app.db`，並 seed 兩個場次 `midterm` / `final`（預設關閉）。

### 2. Frontend

```bash
cd frontend
cp .env.example .env            # 跨網域部署才需要，同機開發可跳過
npm install
npm run dev
```

預設跑在 `http://localhost:5173`，`/api/*` 透過 Vite proxy 轉到 `http://localhost:8000`。

### 3. 初始化操作

1. 以 `admin` 帳號登入（密碼 = `.env` 裡的 `ADMIN_PASSWORD`）。
2. 進「管理員後台」→ 學生白名單新增 `student_id`、姓名、班級。
3. 老師帳號分頁新增老師（初始密碼可之後請老師自行修改）。
4. 場次開關：把 `midterm` / `final` 設為開啟，學生才能送出評分。
5. 學生登入只需要輸入白名單內的學號；老師登入需密碼。

## 測試

```bash
# 後端
cd backend && uv run pytest

# 前端（Vitest + React Testing Library）
cd frontend && npm test
```

## 手動驗收清單

自動化測試涵蓋 API 與核心元件，以下項目請於瀏覽器手動確認：

- [ ] 手機 Safari / Chrome：點 score input 會叫出原生數字鍵盤（非自製 NumberPad）。
- [ ] 桌機：score input 聚焦時 NumberPad 浮現，不遮擋其他 score input。
- [ ] 登出後 cookie 被清除；直接前往 `/me` 會被導回 `/`。
- [ ] 跨場次切換（midterm ↔ final）時 UI 狀態正確、分別保有各自的草稿。
- [ ] 場次關閉時，評分頁唯讀、「送出評分」按鈕停用。

## 重要設計重點

- 評分採「完整版本歷史」：每次送出建立新 row，`latest_submissions` view 取最新。
- 白名單學號若已有評分（身為 grader 或 target），admin 必須先人工處理才能刪除。
- JSON 上傳 / 下載**不含** `self_note`；老師端也看不到 `self_note`。
- 場次獨立開關；關閉後仍可查詢歷史，但後端在 INSERT 前會拒絕（409 `period_closed`）。
- 密碼：老師 bcrypt（cost 12）；admin 依規格以明文存於 `backend/.env`。
- 登入端點（`/api/auth/identify` 與 `/password`）有 in-memory rate limit：每 IP 每分鐘 20 次，超過封鎖 15 分鐘。

## 環境變數

### Backend (`backend/.env`)

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `ADMIN_USERNAME` | `admin` | admin 登入帳號。 |
| `ADMIN_PASSWORD` | — | admin 密碼，**部署前請改**。 |
| `ALLOWED_ORIGINS` | （空） | CORS 允許的前端來源，逗號分隔。同源部署可留空。範例：`https://myapp.pages.dev,https://myapp.example.com`。 |
| `COOKIE_SECURE` | `0` | 是否送 `Secure` cookie。跨網域部署必須設為 `1` 且後端走 https。 |
| `COOKIE_SAMESITE` | `lax` | `lax` / `strict` / `none`。跨網域（前後端不同網域）必須設為 `none`，程式會自動強制 `Secure=True`。 |

### Frontend (`frontend/.env`)

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | （空） | 後端 API base URL。留空時走 same-origin（dev 靠 Vite proxy）。跨網域部署（例如 Cloudflare Pages / Workers + 自建後端）必填，例：`https://api.example.com`。**此變數在 build 時注入**，於 Cloudflare Pages 請加在「Settings → Environment variables → Production / Preview」。 |

### 跨網域部署示意（Cloudflare Pages + 自建後端）

- Frontend（Cloudflare Pages）環境變數：`VITE_API_BASE_URL=https://api.example.com`
- Backend（自建，https）`.env`：
  ```
  ALLOWED_ORIGINS=https://myapp.pages.dev
  COOKIE_SECURE=1
  COOKIE_SAMESITE=none
  ```

## 部署建議

- SQLite 單檔部署即可，建議放在反向代理（nginx / Caddy）後啟用 HTTPS。
- 同源部署：`COOKIE_SECURE=1` + `COOKIE_SAMESITE=lax`；跨網域：`COOKIE_SECURE=1` + `COOKIE_SAMESITE=none`，並正確設定 `ALLOWED_ORIGINS`。
- `.db/app.db` 已在 `.gitignore`，部署時記得掛為持久磁碟。
