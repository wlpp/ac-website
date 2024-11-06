import requests
from bs4 import BeautifulSoup
import mysql.connector
from mysql.connector import pooling
import threading
from queue import Queue
from tqdm import tqdm
import time
import traceback
import random

class ArticleSpider:
    def __init__(self):
        self.queue = Queue()
        self.lock = threading.Lock()
        self.db_config = {
            'host': 'localhost',
            'user': 'root',
            'password': '123456',
            'database': 'ac-website',
            'port': 3306
        }
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive'
        }
        self.cnxpool = mysql.connector.pooling.MySQLConnectionPool(
            pool_name="mypool",
            pool_size=5,
            **self.db_config
        )
        self.init_db()

    def init_db(self):
        try:
            conn = self.cnxpool.get_connection()
            cursor = conn.cursor()
            
            # 先删除表（如果存在）
            cursor.execute('DROP TABLE IF EXISTS articleContent')
            
            # 创建新表
            create_table_sql = '''
            CREATE TABLE articleContent (
                id INT AUTO_INCREMENT PRIMARY KEY,
                article_id VARCHAR(50),
                title VARCHAR(255) NOT NULL,
                content LONGTEXT NOT NULL,
                INDEX idx_title (title),
                INDEX idx_article_id (article_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            '''
            
            cursor.execute(create_table_sql)
            conn.commit()
            print("数据库表创建成功")
            
            # 验证表结构
            cursor.execute("DESCRIBE articleContent")
            columns = cursor.fetchall()
            print("\n表结构:")
            for column in columns:
                print(column)
                
        except Exception as e:
            print(f"数据库初始化失败: {e}")
            print(traceback.format_exc())
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

    def get_post_links(self, page):
        try:
            # 修改URL
            if page == 1:
                url = "https://www.xitmi.com"
            else:
                url = f"https://www.xitmi.com/page/{page}"
            print(f"\n正在获取第 {page} 页链接: {url}")
            
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()  # 检查响应状态
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 修改查找文章的方式
            articles = soup.find_all('article', class_='excerpt')
            
            if not articles:
                print(f"警告: 第 {page} 页没有找到article元素")
                print("页面内容预览:", response.text[:500])
                return []
            
            links = []
            for article in articles:
                # 修改查找链接元素的方式
                link_elem = article.find('h2').find('a')
                if link_elem and 'href' in link_elem.attrs:
                    links.append(link_elem['href'])
            
            print(f"第 {page} 页成功获取到 {len(links)} 个链接")
            return links
            
        except requests.exceptions.RequestException as e:
            print(f"获取第 {page} 页链接失败: {str(e)}")
            return []
        except Exception as e:
            print(f"处理第 {page} 页时发生错误: {str(e)}")
            return []

    def extract_article_id(self, url):
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

    def save_to_db(self, article_id, title, content):
        conn = None
        cursor = None
        try:
            conn = self.cnxpool.get_connection()
            cursor = conn.cursor()
            
            sql = "INSERT INTO articleContent (article_id, title, content) VALUES (%s, %s, %s)"
            cursor.execute(sql, (article_id, title, content))
            conn.commit()
            return True
            
        except Exception as e:
            print(f"保存文章失败 - 标题: {title[:30]}... 错误: {e}")
            if conn:
                conn.rollback()
            return False
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

    def get_article_content(self, pbar):
        while True:
            try:
                # 添加超时处理
                try:
                    url = self.queue.get(timeout=30)  # 增加超时时间
                except Queue.Empty:
                    print("队列超时，线程退出")
                    break

                if url is None:
                    print("收到结束信号，线程退出")
                    break

                print(f"\n正在获取文章: {url}")
                
                # 提取article_id
                article_id = self.extract_article_id(url)
                if not article_id:
                    print(f"无法提取文章ID: {url}")
                    pbar.update(1)  # 即使失败也更新进度
                    continue

                # 添加请求重试机制
                for retry in range(3):
                    try:
                        response = requests.get(url, headers=self.headers, timeout=15)
                        response.raise_for_status()
                        break
                    except Exception as e:
                        if retry == 2:
                            print(f"获取文章失败(已重试3次): {url}, 错误: {str(e)}")
                            pbar.update(1)  # 更新进度
                            continue
                        time.sleep(2)  # 重试前等待

                soup = BeautifulSoup(response.text, 'html.parser')
                
                # 修改查找文章内容的方式
                article = soup.find('div', class_='content')
                
                if article:
                    for element in article.find_all(class_='text-center'):
                        element.decompose()
                    
                    title = article.find('h1')
                    if title:
                        title = title.text.strip()
                        content = str(article)
                        
                        # 添加重试机制
                        for retry in range(3):
                            if self.save_to_db(article_id, title, content):
                                print(f"成功保存文章: ID={article_id}, 标题={title[:50]}...")
                                break
                            elif retry < 2:
                                print(f"保存失败，正在重试 ({retry + 1}/3)")
                                time.sleep(1)
                        
                        pbar.update(1)  # 无论成功失败都更新进度
                    else:
                        print(f"文章标题未找到: {url}")
                        pbar.update(1)
                else:
                    print(f"未找到文章内容: {url}")
                    pbar.update(1)
                
                # 添加随机延迟，避免被封
                time.sleep(random.uniform(1, 3))
                
            except Exception as e:
                print(f"处理文章失败: {url}, 错误: {str(e)}")
                traceback.print_exc()  # 打印详细错误信息
                pbar.update(1)  # 即使发生错误也更新进度
            finally:
                self.queue.task_done()

    def run(self, num_threads=2):  # 减少线程数
        print("开始爬取...")
        all_links = []
        
        # 获取所有页面的链接
        for page in range(1, 7):
            links = self.get_post_links(page)
            if links:
                all_links.extend(links)
                print(f"第 {page} 页链接获取完成，当前总链接数: {len(all_links)}")
            time.sleep(2)
        
        total_articles = len(all_links)
        print(f"\n总共找到 {total_articles} 个文章链接")
        
        if total_articles == 0:
            print("没有找到文章链接，退出程序")
            return

        # 创建进度条
        with tqdm(total=total_articles, desc="爬取进度", ncols=100) as pbar:
            threads = []
            for i in range(num_threads):
                t = threading.Thread(target=self.get_article_content, args=(pbar,))
                t.daemon = True
                t.start()
                threads.append(t)
                print(f"线程 {i+1} 已启动")

            # 添加任务到队列
            for link in all_links:
                self.queue.put(link)

            # 添加结束标记
            for _ in range(num_threads):
                self.queue.put(None)

            # 等待所有任务完成
            self.queue.join()
            
            # 确保所有线程都已结束
            for t in threads:
                t.join(timeout=1)
                
            print("\n所有任务已完成")

def main():
    try:
        start_time = time.time()
        
        spider = ArticleSpider()
        spider.run()
        
        # 验证数据库内容
        try:
            conn = spider.cnxpool.get_connection()
            cursor = conn.cursor()
            
            # 获取总数
            cursor.execute('SELECT COUNT(*) FROM articleContent')
            count = cursor.fetchone()[0]
            
            print(f"\n爬取完成:")
            print(f"数据库中的文章数: {count}")
            print(f"总耗时: {time.time() - start_time:.2f} 秒")
            
            cursor.close()
            conn.close()
            
        except Exception as e:
            print(f"验证数据库失败: {str(e)}")
            print("错误详情:")
            print(traceback.format_exc())
    
    except Exception as e:
        print("程序运行出错:")
        print(str(e))
        print("\n详细错误信息:")
        print(traceback.format_exc())
    
    finally:
        # 添加暂停，防止窗口直接关闭
        input("\n按Enter键退出...")

if __name__ == "__main__":
    main()