#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《Vibe Coding》收工自查（学生端 · 零依赖 · 放仓库根目录跑）
用法（在仓库根目录的终端里）:
  python3 交作业自查.py --day 3 --name 张三
  python3 交作业自查.py            # --day 省略时自动取反思录里最大的 dayN
检查你自己今天的作业四件套，缺哪样它告诉你补哪样，全绿再下班。
老师用同一套硬指标巡查：这里全绿 = 今天不会被记缺交。
--name 可以不传，默认取 git config user.name（所以署名必须是真名）。
CI 版（实验五 T2）：本脚本已挂进 .github/workflows/ci.yml，每次 push 自动跑，
--day 自动探测 + 姓名回退到反思录目录名，CI 里无需任何参数。
"""
import argparse, datetime, pathlib, re, subprocess, sys

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

def latest_reflection_day(name):
    """反思录目录下最大的 dayN.md 的 N；没有则 None"""
    d = pathlib.Path("docs") / "反思录" / name
    if not d.is_dir():
        return None
    days = [int(m.group(1)) for p in d.glob("day*.md")
            if (m := re.fullmatch(r"day(\d+)\.md", p.name))]
    return max(days) if days else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int, required=False)
    ap.add_argument("--name", default="")
    a = ap.parse_args()
    if not pathlib.Path(".git").exists(): sys.exit("请在仓库根目录运行（找不到 .git）")
    name = a.name or sh("git config user.name").strip()
    if not name:
        # CI 环境没有 git config：回退到反思录下唯一的姓名目录
        base = pathlib.Path("docs") / "反思录"
        folders = [p.name for p in base.iterdir() if p.is_dir()] if base.is_dir() else []
        if len(folders) == 1:
            name = folders[0]
    if not name: sys.exit("没查到你的名字：先配 git config user.name 真名，或用 --name 传入")
    day = a.day or latest_reflection_day(name)
    if not day: sys.exit(f"没找到 docs/反思录/{name}/dayN.md，无法确定检查哪一天；用 --day 显式指定")
    since = '--since="2026-10-07T00:00:00"'  # 开营日起算：允许抢跑，提前干的活照算数（与老师巡查同口径）
    my_commits = [x for x in sh(f"git -c core.quotePath=false log {since} --author=\"{name}\" --pretty=format:%h").split() if x]
    f = pathlib.Path("docs") / "反思录" / name / f"day{day}.md"
    today_files = sh(f"git -c core.quotePath=false log {since} --name-only --pretty=format:").splitlines()
    filed_in = f.as_posix() in [p.strip() for p in today_files if p.strip()]
    # 多远端场景：tag 推到任意一个自己的远端都算数（GitHub 有 Pages 部署、Gitee 是课程默认，都认）
    remotes = [r for r in sh("git remote").split() if r.strip()]
    tag_pushed = any(f"refs/tags/day{day}" in sh(f"git ls-remote --tags {r}") for r in remotes)
    checks = [
        (bool(my_commits), f"① 开营后你名下 commit ≥1（{name}）",
         "   现在 0 个。干过的活要署名提交：git add -A && git commit -m \"写人话\" && git push"),
        (f.exists(), f"② 反思件存在 docs/反思录/{name}/day{day}.md",
         "   把今天的反思区 + 至少 1 组对话档案写进这个文件（目录名一字不差）"),
        (filed_in, "③ 反思件已随 commit 入库",
         "   文件在但没提交或没推：git add 它 → commit → push"),
        (tag_pushed, f"④ 封卷 tag day{day} 已推到你自己的仓库",
         f"   你的远程还没这个 tag：git tag day{day} && git push origin --tags（GitHub 部署可 git push github --tags）"),
    ]
    bad = 0
    for ok, title, hint in checks:
        print(("✅ " if ok else "❌ ") + title)
        if not ok:
            print(hint); bad += 1
    print("ℹ️ ⑤ 「第 %d 天完工报告」issue 要在你自己的 Gitee 仓库发，本地查不到——没收工前先发掉（组长查本组时就看这条）" % day)
    print("\n" + ("全绿，可以下班。老师那边你今天的作业判'已交'。" if not bad else f"还差 {bad} 样，补完再跑一次。"))
    sys.exit(0 if not bad else 1)

if __name__ == "__main__": main()
