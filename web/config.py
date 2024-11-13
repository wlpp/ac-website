class Config:
    # ... 其他配置 ...
    # PROXY = None  # 或者从环境变量获取: os.getenv('HTTP_PROXY') 
    PROXY = 'http://127.0.0.1:7890'  # 或者从环境变量获取: os.getenv('HTTP_PROXY') 