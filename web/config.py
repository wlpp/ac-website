import os
import socket

class Config:
    # 获取主机名
    HOSTNAME = socket.gethostname()
    print(f"Current hostname: {HOSTNAME}")
    
    # 根据主机名设置不同的代理端口
    if HOSTNAME == 'LAPTOP-U7I5KDUS':
        PROXY = 'http://127.0.0.1:7890'
    else:
        PROXY = 'http://127.0.0.1:10808'