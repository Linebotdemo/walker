
# WalkAudit-GO

インフラ不要で自治体に即提案できる歩道点検 Web サービスの MVP です。  
**バックエンド: FastAPI / SQLite**  
**フロント: React + MapLibre (PWA)**

## 起動方法 (ローカル)

```bash
# ---- backend ----
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py  # 0.0.0.0:8000
# ---- frontend ----
cd ../frontend
npm i
npm run dev     # http://localhost:5173
```

\(Windows の場合は `python -m venv venv && venv\Scripts\activate`)

## デプロイ

- **Docker**: `cd backend && docker build -t walkaudit-api . && docker run -p 8000:8000 walkaudit-api`
- **Render/Fly.io**: Dockerfile そのまま使用
- **フロント**: `npm run build` → `dist/` を任意の静的ホスティングへ

## API 概要

| メソッド | パス | 内容 |
|----------|------|------|
| POST | `/api/report` | `lat` `lng` `description` `image` を multipart で送信 |
| GET | `/api/reports_geojson` | GeoJSON 形式で一覧 |
| GET | `/images/{filename}` | 画像取得 |

## TODO（自治体提案フェーズで拡張）

- 段差・破損の自動判定モデル (YOLO) 組込
- PayPay Bonus Lite 報酬 API 連携
- 行政側ワークフロー (CSV 自動アップロード) の認証
