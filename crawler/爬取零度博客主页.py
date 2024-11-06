import requests
from bs4 import BeautifulSoup
import mysql.connector
from datetime import datetime
import time

# 数据库配置
db_config = {
    'host': 'localhost',  # 改回本地数据库
    'port': 3306,      
    'user': 'root',          
    'password': '123456',    
    'database': 'ac-website'
}

def create_table():
    """创建articles表"""
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # 先删除旧表
        cursor.execute("DROP TABLE IF EXISTS articles")
        
        # 创建新表，包含article_id字段
        create_table_query = """
        CREATE TABLE IF NOT EXISTS articles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            article_id VARCHAR(50),
            title VARCHAR(255),
            content TEXT,
            image_url VARCHAR(255),
            created_at DATETIME,
            n_date DATE,  # 新增n_date字段
            INDEX idx_article_id (article_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
        
        cursor.execute(create_table_query)
        conn.commit()
        cursor.close()
        conn.close()
        print("数据库表创建成功")
    except mysql.connector.Error as err:
        print(f"数据库连接失败: {err}")
        return False
    return True

def save_to_mysql(article_id, title, content, image_url, n_date):
    """保存数据到MySQL"""
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        insert_query = """
        INSERT INTO articles (article_id, title, content, image_url, created_at, n_date)
        VALUES (%s, %s, %s, %s, %s, %s)
        """
        
        # 使用当前日期作为n_date的值
        values = (article_id, title, content, image_url, datetime.now(), n_date)
        cursor.execute(insert_query, values)
        
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except mysql.connector.Error as err:
        print(f"保存到数据库失败: {err}")
        return False

def extract_article_id(url):
    """从URL中提取文章ID"""
    try:
        # 查找最后一个/和.html之间的内容
        last_slash = url.rstrip('/').rfind('/')
        if last_slash == -1:
            return None
            
        # 获取最后一个/之后的内容
        id_part = url[last_slash + 1:]
        
        # 如果有.html后缀，去掉它
        if '.html' in id_part:
            id_part = id_part.split('.html')[0]
            
        return id_part
    except Exception as e:
        print(f"提取文章ID失败: {url}, 错误: {str(e)}")
        return None

def crawl_page(page_num):
    """爬取指定页码的数据"""
    # 初始化页面数据
    page_data = {'articles': []}

    # 修改URL逻辑
    if page_num == 1:
        url = "https://www.xitmi.com"
    else:
        url = f"https://www.xitmi.com/page/{page_num}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # 查找所有文章
    articles = soup.find_all('article', class_='excerpt')  # 修改查找文章的方式
    print(f"找到 {len(articles)} 篇文章")
    
    for article in articles:
        try:
            # 获取文章链接和ID
            link_element = article.find('h2').find('a')  # 修改查找链接的方式
            if link_element and 'href' in link_element.attrs:
                full_url = link_element['href']
                article_id = extract_article_id(full_url)
                
                if not article_id:
                    print(f"警告: 无法从URL提取ID: {full_url}")
                    continue
                
                print(f"提取到文章ID: {article_id}, URL: {full_url}")  # 调试输出
                
                # 获取标题
                title = link_element.text.strip()
                
                # 获取图片URL
                img_element = article.find('a', class_='focus')  # 修改查找图片的方式
                if img_element:
                    img_tag = img_element.find('img')
                    image_url = img_tag.get('data-src') or img_tag.get('src', '') if img_tag else ''
                else:
                    image_url = ''
                
                # 获取内容
                content_element = article.find('p', class_='note')  # 修改查找内容的方式
                content = content_element.text.strip() if content_element else ''
                
                # 获取日期
                time_element = article.find('time')  # 查找time标签
                n_date = time_element.text.strip() if time_element else ''
                
                # 创建文章数据字典
                article_data = {
                    'article_id': article_id,
                    'title': title,
                    'image_url': image_url,
                    'content': content,
                    'n_date': n_date
                }
                
                # 添加到页面数据中
                page_data['articles'].append(article_data)
                
                # 保存到数据库
                if title and content:
                    save_to_mysql(article_id, title, content, image_url, n_date)
                    print(f"成功保存文章: ID={article_id}, 标题={title[:30]}...")
                
            time.sleep(1)
            
        except Exception as e:
            print(f"处理文章时出错: {str(e)}")
            continue
    
    # 打印当页数据统计
    print(f"\n=== 第 {page_num} 页数据统计 ===")
    print(f"总文章数: {len(page_data['articles'])}")
    print(f"文章ID列表: {[article['article_id'] for article in page_data['articles']]}")
    print("=" * 50)
    
    return page_data

def main():
    # 创建数据表
    create_table()
    
    total_articles = 0  # 添加总文章计数器
    
    # 爬取前6页数据
    for page in range(1, 7):
        print(f"\n正在爬取第 {page} 页...")
        page_data = crawl_page(page)
        total_articles += len(page_data['articles'])  # 累加每页的文章数
        time.sleep(2)  # 页面之间的延时
    
    # 从数据库获取实际保存的记录数
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM articles")
        db_count = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        
        # 打印统计信息
        print("\n爬取完成！")
        print("=" * 50)
        print(f"总共找到文章数: {total_articles}")
        print(f"成功保存到数据库: {db_count} 条记录")
        print("=" * 50)
        
    except mysql.connector.Error as err:
        print(f"\n获取数据库统计失败: {err}")
        print(f"总共找到文章数: {total_articles}")

if __name__ == "__main__":
    main()
