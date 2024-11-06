import requests
from bs4 import BeautifulSoup
import re
import os
import time
import random
from concurrent.futures import ThreadPoolExecutor
from tqdm import tqdm

# 基础URL
base_url = "https://www.wnacg.com/search/index.php?q=%E9%80%86%E8%BD%89&m=&syn=yes&f=_all&s=create_time_DESC&p="

# 代理设置
proxies = {
    "http": "http://localhost:7890",
    "https": "http://localhost:7890"
}

# 自定义请求头，包含User-Agent
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
}

# 创建逆轉目录
parent_dir = "逆轉"
os.makedirs(parent_dir, exist_ok=True)

def sanitize_filename(filename):
    # 移除不合法的文件名字符
    return re.sub(r'[\\/*?:"<>|]', "", filename)

def download_images(a_tag, number):
    try:
        # 构造新的URL
        new_url = f"https://www.wnacg.com/photos-gallery-aid-{number}.html"
        print(f"正在请求图片页面: {new_url}")
        new_response = requests.get(new_url, headers=headers, proxies=proxies)
        new_response.raise_for_status()

        # 打印完整的响应内容
        imglist_content = new_response.text

        # 使用正则表达式提取imglist中的所有"img5.(.*?).jpg"
        img_urls = re.findall(r'img5.(.*?).jpg', imglist_content)

        # 拼接完整的URL并下载图片
        full_img_urls = [f"https://img5.{img_url}.jpg" for img_url in img_urls]
        dir_name = os.path.join(parent_dir, sanitize_filename(a_tag.text.strip()))
        os.makedirs(dir_name, exist_ok=True)

        for full_img_url in full_img_urls:
            print(f"正在下载图片: {full_img_url}")
            try:
                img_response = requests.get(full_img_url, headers=headers, proxies=proxies)
                img_response.raise_for_status()

                # 检查响应内容是否为空
                if img_response.content:
                    # 保存图片到目录
                    img_name = os.path.basename(full_img_url)
                    img_path = os.path.join(dir_name, img_name)
                    with open(img_path, 'wb') as img_file:
                        img_file.write(img_response.content)
                else:
                    print(f"图片 {full_img_url} 的内容为空，未下载。")

            except requests.exceptions.RequestException as e:
                print(f"下载图片 {full_img_url} 时出错: {e}")

    except requests.exceptions.RequestException as e:
        print(f"下载 {a_tag.text} 的图片时出错: {e}")

def scrape_page(page):
    try:
        # 构造每一页的URL
        url = base_url + str(page)
        print(f"正在爬取第 {page} 页: {url}")
        
        # 发送GET请求到指定URL，使用代理和自定义请求头
        response = requests.get(url, headers=headers, proxies=proxies)
        response.raise_for_status()  # 检查请求是否成功

        # 使用BeautifulSoup解析页面内容
        soup = BeautifulSoup(response.content, 'html.parser')

        # 查找所有类为'gallary_item'的元素
        gallary_items = soup.find_all(class_='gallary_item')

        # 遍历每个gallary_item并提取'title'类中的'a'元素的href属性
        for item in gallary_items:
            title_tag = item.find(class_='title')
            if title_tag:
                a_tag = title_tag.find('a')
                if a_tag and 'href' in a_tag.attrs:
                    # 检查em元素的text是否为'逆轉'，并且a元素的文本长度不超过40
                    em_tag = a_tag.find('em')
                    if em_tag and em_tag.text == '逆轉' and len(a_tag.text) <= 40:
                        # 提取href中最后一个'-'到'.html'之间的数字
                        href = a_tag['href']
                        start_index = href.rfind('-') + 1
                        end_index = href.rfind('.html')
                        number = href[start_index:end_index]
                        
                        # 提示当前爬取的a_tag.text
                        print(f"正在处理: {a_tag.text}")

                        # 使用多线程下载图片
                        download_images(a_tag, number)

                        # 随机延迟以防止IP被封
                        time.sleep(random.uniform(1, 3))

    except requests.exceptions.RequestException as e:
        print(f"爬取第 {page} 页时出错: {e}")

if __name__ == "__main__":
    # 使用ThreadPoolExecutor进行多线程爬取
    with ThreadPoolExecutor(max_workers=5) as executor:
        list(tqdm(executor.map(scrape_page, range(1, 3)), total=2, desc="总进度"))
