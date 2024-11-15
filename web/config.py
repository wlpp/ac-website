import os
import socket

class Config:
    # ... 其他配置 ...
    
    # # 获取主机名
    # HOSTNAME = socket.gethostname()
    # print(f"Current hostname: {HOSTNAME}")
    
    # # 根据主机名设置不同的代理
    # if 'acwlpp.top' in HOSTNAME:
    #     PROXY = 'http://127.0.0.1:10808'
    # else:
        PROXY = 'http://127.0.0.1:7890'