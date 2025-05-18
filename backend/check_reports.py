import sqlite3

# DBファイルに接続
conn = sqlite3.connect("walkaudit.db")
cursor = conn.cursor()

# ヘッダー表示
print("{:<5} {:<20} {:<50}".format("ID", "TITLE", "ADDRESS"))
print("-" * 80)

# 結城市を含むレポートを検索
cursor.execute("SELECT id, title, address FROM reports WHERE address LIKE ?", ('%結城市%',))
rows = cursor.fetchall()

# 結果を出力
for row in rows:
    print("{:<5} {:<20} {:<50}".format(row[0], row[1], row[2]))

# 接続を閉じる
conn.close()
