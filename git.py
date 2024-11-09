#!/usr/bin/env python3
import os
import sys
import shutil
from datetime import datetime

def git_upload():
    try:
        # 删除所有 __pycache__ 文件夹
        for root, dirs, files in os.walk('.'):
            if '__pycache__' in dirs:
                pycache_path = os.path.join(root, '__pycache__')
                shutil.rmtree(pycache_path)
                print(f"已删除: {pycache_path}")
        
        # 检查是否有更改需要提交
        status = os.popen('git status').read()
        
        if "nothing to commit" in status:
            if "Your branch is ahead" in status:
                # 如果只是需要推送已有的提交
                print("检测到本地提交需要推送到远程...")
                result = os.system('git push')
                if result != 0:
                    raise Exception("Push failed")
                print("\n✅ Successfully pushed to remote!")
                return
            else:
                print("没有需要提交的更改")
                return
        
        # 有更改需要提交时的正常流程
        commit_message = input("请输入提交信息 (直接回车使用时间戳): ").strip()
        
        if not commit_message:
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            commit_message = f"Auto commit at {current_time}"
        
        commands = [
            'git add .',
            f'git commit -m "{commit_message}"',
            'git push'
        ]
        
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