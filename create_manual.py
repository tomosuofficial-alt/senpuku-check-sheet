#!/usr/bin/env python3
"""よいどころ千福 チェックリストアプリ スタッフ向け操作マニュアル PDF"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black, Color
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiMin-W3'))

GO = 'HeiseiKakuGo-W5'
MIN = 'HeiseiMin-W3'
W, H = A4
M = 24 * mm  # margin

# Color system
INK = HexColor('#1a1a2e')
INK_LIGHT = HexColor('#4a4a5a')
INK_MUTED = HexColor('#8a8a9a')
ACCENT = HexColor('#c30d23')
ACCENT_SOFT = HexColor('#fef2f2')
WARM_BG = HexColor('#faf8f5')
CARD_BG = HexColor('#f5f3f0')
NAVY = HexColor('#0a1628')
GOLD = HexColor('#c3a569')
GOLD_DIM = HexColor('#a08850')
DIVIDER = HexColor('#e0ddd8')


def draw_page_number(c, page_num, total=4):
    c.setFillColor(INK_MUTED)
    c.setFont(MIN, 8)
    c.drawCentredString(W / 2, 14 * mm, f'{page_num} / {total}')


def draw_thin_line(c, x1, y, x2, color=DIVIDER):
    c.setStrokeColor(color)
    c.setLineWidth(0.5)
    c.line(x1, y, x2, y)


def draw_numbered_circle(c, x, y, num):
    c.setFillColor(ACCENT)
    c.circle(x, y, 4.5 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(GO, 11)
    c.drawCentredString(x, y - 1.5 * mm, str(num))


def create_manual():
    out = os.path.join(os.path.dirname(__file__), 'manual_staff.pdf')
    c = canvas.Canvas(out, pagesize=A4)

    # =============================================
    # PAGE 1 — Cover
    # =============================================
    # Full navy background
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Subtle gold accent line at top
    c.setStrokeColor(GOLD_DIM)
    c.setLineWidth(0.8)
    c.line(M, H - 45 * mm, W - M, H - 45 * mm)

    # Shop name
    c.setFillColor(GOLD)
    c.setFont(GO, 11)
    c.drawString(M, H - 60 * mm, 'よいどころ千福')

    # Main title
    c.setFillColor(white)
    c.setFont(GO, 32)
    c.drawString(M, H - 85 * mm, 'チェックリスト')
    c.drawString(M, H - 100 * mm, 'アプリ')
    c.setFont(GO, 16)
    c.setFillColor(HexColor('#ffffffcc'))
    c.drawString(M, H - 118 * mm, '操作マニュアル')

    # Subtitle
    c.setFillColor(GOLD_DIM)
    c.setFont(MIN, 10)
    c.drawString(M, H - 140 * mm, 'スタッフ向け かんたんガイド  |  全4ページ')

    # Footer
    c.setStrokeColor(HexColor('#ffffff15'))
    c.setLineWidth(0.5)
    c.line(M, 50 * mm, W - M, 50 * mm)
    c.setFillColor(HexColor('#ffffff55'))
    c.setFont(MIN, 9)
    c.drawString(M, 38 * mm, '2026.03  |  by TOMOSU.design')

    c.showPage()

    # =============================================
    # PAGE 2 — Getting Started
    # =============================================
    y = H - M

    # Page header
    c.setFillColor(ACCENT)
    c.setFont(GO, 9)
    c.drawString(M, y, 'STEP 1')
    y -= 9 * mm
    c.setFillColor(INK)
    c.setFont(GO, 22)
    c.drawString(M, y, 'アプリを開く')
    y -= 4 * mm
    draw_thin_line(c, M, y, W - M, ACCENT)
    y -= 14 * mm

    # Step 1
    draw_numbered_circle(c, M + 5 * mm, y, 1)
    c.setFillColor(INK)
    c.setFont(GO, 13)
    c.drawString(M + 14 * mm, y - 1.5 * mm, 'ブラウザでアクセス')
    y -= 10 * mm
    c.setFillColor(INK_LIGHT)
    c.setFont(MIN, 10)
    c.drawString(M + 14 * mm, y, 'スマホのブラウザ（Chrome / Safari）でアクセスします。')
    y -= 10 * mm

    # URL card
    c.setFillColor(CARD_BG)
    c.roundRect(M + 14 * mm, y - 4 * mm, 130 * mm, 11 * mm, 2 * mm, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.setFont(GO, 11)
    c.drawString(M + 20 * mm, y - 0.5 * mm, 'senpuku-manual.netlify.app')
    y -= 22 * mm

    # Step 2
    draw_numbered_circle(c, M + 5 * mm, y, 2)
    c.setFillColor(INK)
    c.setFont(GO, 13)
    c.drawString(M + 14 * mm, y - 1.5 * mm, 'ホーム画面に追加する（おすすめ）')
    y -= 10 * mm
    c.setFillColor(INK_LIGHT)
    c.setFont(MIN, 10)
    c.drawString(M + 14 * mm, y, 'ブラウザのメニューから「ホーム画面に追加」を選ぶと、')
    y -= 6 * mm
    c.drawString(M + 14 * mm, y, 'アプリのようにワンタップで開けるようになります。')
    y -= 22 * mm

    # --- Section 2: Tabs ---
    draw_thin_line(c, M, y, W - M)
    y -= 12 * mm

    c.setFillColor(ACCENT)
    c.setFont(GO, 9)
    c.drawString(M, y, 'GUIDE')
    y -= 9 * mm
    c.setFillColor(INK)
    c.setFont(GO, 22)
    c.drawString(M, y, '画面の見方')
    y -= 4 * mm
    draw_thin_line(c, M, y, W - M, ACCENT)
    y -= 16 * mm

    # Tab list
    tabs = [
        ('開店', '出勤〜開店までの準備チェック'),
        ('閉店', '閉店後の片付け・清掃チェック'),
        ('トイレ清掃', '清掃チェック＋60分タイマー'),
        ('マニュアル', '各種業務マニュアルを閲覧'),
    ]
    for i, (name, desc) in enumerate(tabs):
        # Tab name pill
        c.setFillColor(NAVY)
        tw = c.stringWidth(name, GO, 10) + 10 * mm
        c.roundRect(M, y - 3 * mm, tw, 9 * mm, 4.5 * mm, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont(GO, 10)
        c.drawString(M + 5 * mm, y - 0.5 * mm, name)

        # Description
        c.setFillColor(INK_LIGHT)
        c.setFont(MIN, 10)
        c.drawString(M + tw + 5 * mm, y - 0.5 * mm, desc)
        y -= 15 * mm

    y -= 3 * mm

    # Other buttons
    c.setFillColor(CARD_BG)
    c.roundRect(M, y - 8 * mm, W - 2 * M, 22 * mm, 3 * mm, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont(GO, 10)
    c.drawString(M + 6 * mm, y + 7 * mm, '?  ボタン')
    c.setFillColor(INK_LIGHT)
    c.setFont(MIN, 10)
    c.drawString(M + 35 * mm, y + 7 * mm, 'サポートへ問い合わせ')
    c.setFillColor(INK)
    c.setFont(GO, 10)
    c.drawString(M + 6 * mm, y - 3 * mm, '歯車ボタン')
    c.setFillColor(INK_LIGHT)
    c.setFont(MIN, 10)
    c.drawString(M + 35 * mm, y - 3 * mm, 'スタッフの追加・管理')

    draw_page_number(c, 2)
    c.showPage()

    # =============================================
    # PAGE 3 — Daily Workflow
    # =============================================
    y = H - M

    c.setFillColor(ACCENT)
    c.setFont(GO, 9)
    c.drawString(M, y, 'STEP 2')
    y -= 9 * mm
    c.setFillColor(INK)
    c.setFont(GO, 22)
    c.drawString(M, y, 'チェックの流れ')
    y -= 4 * mm
    draw_thin_line(c, M, y, W - M, ACCENT)
    y -= 16 * mm

    steps = [
        ('担当者を選ぶ', '画面上部のプルダウンから自分の名前を選択'),
        ('タブを選ぶ', '「開店」「閉店」など、今やる作業のタブをタップ'),
        ('項目をチェック', '各項目をタップしてチェック。メモは展開して確認'),
        ('わからない時は「参照」', 'マニュアルがある項目は「参照」ボタンで確認'),
        ('チェック完了を送信', '画面下の赤いボタンをタップして記録を保存'),
    ]

    for i, (title, desc) in enumerate(steps):
        draw_numbered_circle(c, M + 5 * mm, y, i + 1)
        c.setFillColor(INK)
        c.setFont(GO, 13)
        c.drawString(M + 14 * mm, y - 1.5 * mm, title)
        y -= 9 * mm
        c.setFillColor(INK_LIGHT)
        c.setFont(MIN, 10)
        c.drawString(M + 14 * mm, y, desc)
        y -= 5 * mm
        if i < len(steps) - 1:
            # Connector line
            c.setStrokeColor(HexColor('#e0ddd8'))
            c.setLineWidth(0.5)
            c.setDash(2, 2)
            c.line(M + 5 * mm, y, M + 5 * mm, y - 5 * mm)
            c.setDash()
            y -= 9 * mm

    # Important note
    y -= 12 * mm
    c.setFillColor(ACCENT_SOFT)
    c.roundRect(M, y - 8 * mm, W - 2 * M, 14 * mm, 3 * mm, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.setFont(GO, 10)
    c.drawString(M + 6 * mm, y - 2 * mm, '※ 担当者を選んでからチェックしてください！')

    # Toilet timer section
    y -= 35 * mm
    draw_thin_line(c, M, y, W - M)
    y -= 12 * mm

    c.setFillColor(ACCENT)
    c.setFont(GO, 9)
    c.drawString(M, y, 'TIMER')
    y -= 9 * mm
    c.setFillColor(INK)
    c.setFont(GO, 18)
    c.drawString(M, y, 'トイレ清掃タイマー')
    y -= 14 * mm

    timer_steps = [
        '「トイレ清掃」タブを開く',
        '「開始」ボタンでタイマースタート（60分）',
        'タイマーが0になったら清掃のタイミング',
        '清掃チェック項目を確認して送信',
        '「リセット」で次の60分を開始',
    ]
    for i, step in enumerate(timer_steps):
        c.setFillColor(INK)
        c.setFont(GO, 10)
        c.drawString(M + 2 * mm, y, f'{i + 1}.')
        c.setFillColor(INK_LIGHT)
        c.setFont(MIN, 10)
        c.drawString(M + 10 * mm, y, step)
        y -= 7 * mm

    draw_page_number(c, 3)
    c.showPage()

    # =============================================
    # PAGE 4 — Troubleshooting
    # =============================================
    y = H - M

    c.setFillColor(ACCENT)
    c.setFont(GO, 9)
    c.drawString(M, y, 'FAQ')
    y -= 9 * mm
    c.setFillColor(INK)
    c.setFont(GO, 22)
    c.drawString(M, y, '困ったときは')
    y -= 4 * mm
    draw_thin_line(c, M, y, W - M, ACCENT)
    y -= 16 * mm

    qas = [
        ('チェックを間違えて送信した',
         'もう一度正しくチェックして再送信すれば上書きされます。'),
        ('担当者を選び忘れて送信した',
         '担当者を選んでから、もう一度チェック＆送信してください。'),
        ('画面が真っ白 / 読み込みが終わらない',
         'ブラウザを閉じて再度開いてください。\n'
         'それでもダメならキャッシュをクリアしてください。'),
        ('スタッフを追加したい',
         '右上の歯車ボタン → 名前を入力 →「追加」をタップ。'),
    ]

    for i, (q, a) in enumerate(qas):
        # Question
        c.setFillColor(INK)
        c.setFont(GO, 11)
        c.drawString(M, y, f'Q.  {q}')
        y -= 8 * mm

        # Answer
        c.setFillColor(INK_LIGHT)
        c.setFont(MIN, 10)
        for line in a.split('\n'):
            c.drawString(M + 7 * mm, y, line)
            y -= 6 * mm

        if i < len(qas) - 1:
            y -= 3 * mm
            draw_thin_line(c, M, y, W - M)
            y -= 8 * mm

    # Support section
    y -= 10 * mm
    draw_thin_line(c, M, y, W - M)
    y -= 12 * mm

    c.setFillColor(ACCENT)
    c.setFont(GO, 9)
    c.drawString(M, y, 'SUPPORT')
    y -= 9 * mm
    c.setFillColor(INK)
    c.setFont(GO, 18)
    c.drawString(M, y, 'サポートへ問い合わせ')
    y -= 14 * mm

    support_steps = [
        ('?  ボタンをタップ', '画面右上の「?」マークを押します'),
        ('フォームに入力', 'カテゴリ・名前・内容を入力して「送信」'),
        ('返答を待つ', '内容はサポートチームに届きます'),
    ]
    for i, (title, desc) in enumerate(support_steps):
        draw_numbered_circle(c, M + 5 * mm, y, i + 1)
        c.setFillColor(INK)
        c.setFont(GO, 12)
        c.drawString(M + 14 * mm, y - 1.5 * mm, title)
        c.setFillColor(INK_MUTED)
        c.setFont(MIN, 9)
        c.drawString(M + 14 * mm, y - 9 * mm, desc)
        y -= 20 * mm

    # Footer message
    c.setFillColor(CARD_BG)
    c.roundRect(M, 22 * mm, W - 2 * M, 12 * mm, 3 * mm, fill=1, stroke=0)
    c.setFillColor(INK_MUTED)
    c.setFont(GO, 9)
    c.drawCentredString(W / 2, 26 * mm, 'わからないことがあったら、遠慮なく ? ボタンから問い合わせてください')

    draw_page_number(c, 4)
    c.showPage()
    c.save()
    print(f'Created: {out}')


if __name__ == '__main__':
    create_manual()
