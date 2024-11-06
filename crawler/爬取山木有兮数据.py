import requests
from bs4 import BeautifulSoup
import mysql.connector
import time

# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,      # 数据库服务器地址
    'user': 'root',          # 数据库用户名
    'password': '123456',    # 数据库密码
    'database': 'website'    # 数据库名称
}

def create_table():
    """创建数据表"""
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS articles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255),
        image_url TEXT,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    
    cursor.execute(create_table_sql)
    conn.commit()
    cursor.close()
    conn.close()

def save_to_mysql(title, image_url, content):
    """保存数据到MySQL"""
    conn = None
    cursor = None
    try:
        # 建立连接
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 准备SQL语句
        insert_sql = """
        INSERT INTO articles (title, image_url, content)
        VALUES (%s, %s, %s)
        """
        
        # 执行插入
        cursor.execute(insert_sql, (title, image_url, content))
        
        # 提交事务
        conn.commit()
        print(f'成功插入数据: 标题={title}, 图片URL={image_url[:50]}...')
        
    except mysql.connector.Error as err:
        print(f'数据库错误: {err}')
        if conn:
            try:
                conn.rollback()
                print("执行回滚操作")
            except:
                print("回滚失败")
        raise  # 抛出异常以便追踪问题
        
    finally:
        # 确保资源正确关闭
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def crawl_page(page_num):
    """爬取指定页码的数据"""
    url = f'https://symxyx.com/page/{page_num}/'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 修改文章选择器
        articles = soup.find_all('article', class_='post-list-thumb')
        print(f'找到 {len(articles)} 篇文章')
        
        for article in articles:
            # 提取标题
            title_element = article.find('h3')
            title = title_element.text.strip() if title_element else ''
            
            # 提取图片URL
            post_thumb = article.find('div', class_='post-thumb')
            if post_thumb:
                image_element = post_thumb.find('img')
                image_url = image_element.get('data-src', '') if image_element else ''
            else:
                image_url = ''
            
            # 提取内容
            content_element = article.find('div', class_='float-content')
            content = content_element.text.strip() if content_element else ''
            
            # 打印调试信息
            print(f'\n找到文章:')
            print(f'标题: {title}')
            print(f'图片URL: {image_url}')
            print(f'内容长度: {len(content)} 字符')
            
            # 保存到数据库
            if title and content:
                save_to_mysql(title, image_url, content)
            else:
                print('标题或内容为空，跳过保存')
        
        return True
    
    except Exception as e:
        print(f'爬取第{page_num}页时出错: {str(e)}')
        return False

def main():
    """主函数"""
    try:
        # 创建数据表
        create_table()
        print('数据表创建成功')
        
        # 爬取前3页数据
        for page in range(1, 5):
            print(f'\n开始爬取第{page}页...')
            success = crawl_page(page)
            
            if not success:
                print(f'第{page}页爬取失败，停止爬取')
                break
                
            # 添加延时，避免请求过于频繁
            time.sleep(2)
        
        print('爬取完成！')
        
    except Exception as e:
        print(f'程序执行出错: {str(e)}')

if __name__ == '__main__':
    main()
