#!/usr/bin/env python3
import os
import sys
from datetime import datetime

def git_upload():
    try:
        # 获取用户输入的提交信息
        commit_message = input("请输入提交信息 (直接回车使用时间戳): ").strip()
        
        # 如果用户没有输入，使用时间戳
        if not commit_message:
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            commit_message = f"Auto commit at {current_time}"
        
        # Git 命令序列
        commands = [
            'git add .',
            f'git commit -m "{commit_message}"',
            'git push'
        ]
        
        # 执行命令
        for command in commands:
            result = os.system(command)
            if result != 0:
                raise Exception(f"Command failed: {command}")
                
        print("\n✅ Successfully uploaded to Git!")
        print(f"Commit message: {commit_message}")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    git_upload()