from flask import Blueprint, jsonify, request, make_response, send_file
from flask_cors import CORS
import os
import requests
from bs4 import BeautifulSoup
import logging
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
import re
from functools import lru_cache
from datetime import datetime, timedelta
import threading

# 设置日志
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# 创建蓝图
crawling_bp = Blueprint('crawling', __name__)
CORS(crawling_bp)

# 固定代理配置
PROXY = 'http://127.0.0.1:7890'

# 缓存字典，用于存储图片列表数据
gallery_cache = {}
gallery_imgs_cache = {}

# 缓存过期时间（分钟）
CACHE_EXPIRE_MINUTES = 5

def create_session():
    """创建一个带有重试机制的会话"""
    session = requests.Session()
    
    # 配置重试策略
    retry_strategy = Retry(
        total=3,  # 最大重试次数
        backoff_factor=1,  # 重试间隔
        status_forcelist=[500, 502, 503, 504]  # 需要重试的HTTP状态码
    )
    
    # 配置适配器
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    return session

# 创建会话池
session_pool = {}

def get_session():
    """从会话池获取或创建新的会话"""
    thread_id = threading.get_ident()
    if thread_id not in session_pool:
        session_pool[thread_id] = create_session()
    return session_pool[thread_id]

@crawling_bp.route('/gallery')
def gallery_page():
    """画廊页面路由"""
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(current_dir, 'src', 'views', 'gallery.html')
    return send_file(file_path)

@crawling_bp.route('/api/gallery-list')
def gallery_list():
    """获取图片列表"""
    try:
        page = request.args.get('page', 1, type=int)
        if page < 1:
            page = 1
            
        # 检查缓存
        cache_key = f'gallery_list_{page}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }

        proxies = {
            'http': PROXY,
            'https': PROXY
        }

        # 创建会话
        session = get_session()

        # 发送GET请求，使用传入的页码
        url = f'https://www.wnacg.com/albums-index-page-{page}-cate-22.html'
        response = session.get(
            url, 
            headers=headers, 
            proxies=proxies,
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 解析HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        gallery_items = soup.select('.gallary_item .pic_box a')

        # 提取数据
        result = []
        for item in gallery_items:
            title = item.get('title', '')
            # 移除<em>和</em>标签
            title = title.replace('<em>', '').replace('</em>', '')
            img = item.find('img')
            
            # 提取aid
            href = item.get('href', '')
            aid = None
            if href:
                # 提取href中最后一个'-'到'.html'之间的数字
                start_index = href.rfind('-') + 1
                end_index = href.rfind('.html')
                if start_index > 0 and end_index > start_index:
                    aid = href[start_index:end_index]
            
            if img:
                img_url = img.get('src', '')
                if img_url.startswith('/'):
                    img_url = f"https://{img_url}"
                
                result.append({
                    'title': title,
                    'image_url': img_url,
                    'aid': aid
                })

        # 缓存结果
        result_data = {
            'success': True,
            'data': result,
            'total': len(result)
        }
        gallery_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)

    except requests.Timeout as e:
        logger.error(f"请求超时: {str(e)}")
        return jsonify({
            'success': False,
            'message': '请求超时',
            'error': str(e)
        }), 504
    except requests.RequestException as e:
        logger.error(f"网络请求错误: {str(e)}")
        return jsonify({
            'success': False,
            'message': '网络请求失败',
            'error': str(e)
        }), 500
    except Exception as e:
        logger.error(f"处理数据时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if 'session' in locals():
            session.close()

@crawling_bp.route('/api/gallery-imgs')
def gallery_imgs():
    """获取画廊图片列表"""
    try:
        aid = request.args.get('aid')
        if not aid:
            return jsonify({
                'success': False,
                'message': '缺少aid参数'
            }), 400
            
        # 检查缓存
        cache_key = f'gallery_imgs_{aid}'
        cached_data = gallery_imgs_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }

        proxies = {
            'http': PROXY,
            'https': PROXY
        }

        # 创建会话
        session = get_session()

        # 构造URL并发送请求
        url = f'https://www.wnacg.com/photos-gallery-aid-{aid}.html'
        response = session.get(
            url, 
            headers=headers, 
            proxies=proxies,
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 解析图片URL
        imglist_content = response.text
        img_urls = re.findall(r'{ url:(.*?)"}', imglist_content)
        img_urls2 = []
        
        for url in img_urls:
            # 找到第一个'//'和第一个'\'之间的内容
            start_idx = url.find('//') + 2
            end_idx = url.find('", caption')
            if start_idx != -1 and end_idx != -1:
                cleaned_url = url[start_idx:end_idx]
                cleaned_url = cleaned_url.replace('\\', '')
                img_urls2.append(cleaned_url)

        # 拼接完整的URL
        full_img_urls = [f"https://{img_url}" for img_url in img_urls2]

        # 缓存结果
        result_data = {
            'success': True,
            'data': {
                'images': full_img_urls,
                'total': len(full_img_urls)
            }
        }
        gallery_imgs_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)

    except requests.Timeout as e:
        logger.error(f"请求超时: {str(e)}")
        return jsonify({
            'success': False,
            'message': '请求超时',
            'error': str(e)
        }), 504
    except requests.RequestException as e:
        logger.error(f"网络请求错误: {str(e)}")
        return jsonify({
            'success': False,
            'message': '网络请求失败',
            'error': str(e)
        }), 500
    except Exception as e:
        logger.error(f"处理数据时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if 'session' in locals():
            session.close()

@crawling_bp.route('/api/gallery-search')
def gallery_search():
    """搜索图片列表"""
    try:
        # 获取搜索参数
        q = request.args.get('q', '')
        page = request.args.get('page', 1, type=int)
        
        if not q:
            return jsonify({
                'success': False,
                'message': '缺少搜索关键词'
            }), 400
            
        if page < 1:
            page = 1
            
        # 检查缓存
        cache_key = f'gallery_search_{q}_{page}'
        cached_data = gallery_cache.get(cache_key)
        if cached_data:
            cache_time, data = cached_data
            if datetime.now() - cache_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
                return jsonify(data)
        
        # 设置请求头
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }

        proxies = {
            'http': PROXY,
            'https': PROXY
        }

        # 创建会话
        session = get_session()

        # 构造搜索URL
        url = f'https://www.wnacg.com/search/index.php?q={q}&m=&syn=yes&f=_all&s=create_time_DESC&p={page}'
        
        response = session.get(
            url, 
            headers=headers, 
            proxies=proxies,
            timeout=(5, 30),
            verify=False
        )
        response.encoding = 'utf-8'

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"请求失败，状态码：{response.status_code}")
            return jsonify({
                'success': False,
                'message': '获取数据失败',
                'error': f'HTTP {response.status_code}'
            }), 500

        # 解析HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        gallery_items = soup.select('.gallary_item .pic_box a')

        # 提取数据
        result = []
        for item in gallery_items:
            title = item.get('title', '')
            # 移除<em>和</em>标签
            title = title.replace('<em>', '').replace('</em>', '')
            img = item.find('img')
            
            # 提取aid
            href = item.get('href', '')
            aid = None
            if href:
                # 提取href中最后一个'-'到'.html'之间的数字
                start_index = href.rfind('-') + 1
                end_index = href.rfind('.html')
                if start_index > 0 and end_index > start_index:
                    aid = href[start_index:end_index]
            
            if img:
                img_url = img.get('src', '')
                if img_url.startswith('/'):
                    img_url = f"https://{img_url}"
                
                result.append({
                    'title': title,
                    'image_url': img_url,
                    'aid': aid
                })

        # 缓存结果
        result_data = {
            'success': True,
            'data': result,
            'total': len(result)
        }
        gallery_cache[cache_key] = (datetime.now(), result_data)
        
        return jsonify(result_data)

    except requests.Timeout as e:
        logger.error(f"请求超时: {str(e)}")
        return jsonify({
            'success': False,
            'message': '请求超时',
            'error': str(e)
        }), 504
    except requests.RequestException as e:
        logger.error(f"网络请求错误: {str(e)}")
        return jsonify({
            'success': False,
            'message': '网络请求失败',
            'error': str(e)
        }), 500
    except Exception as e:
        logger.error(f"处理数据时发生错误: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': '服务器内部错误',
            'error': str(e)
        }), 500
    finally:
        if 'session' in locals():
            session.close()

# 定期清理过期缓存
def clean_expired_cache():
    current_time = datetime.now()
    expire_time = timedelta(minutes=CACHE_EXPIRE_MINUTES)
    
    # 清理gallery_cache
    expired_keys = [
        key for key, (cache_time, _) in gallery_cache.items()
        if current_time - cache_time > expire_time
    ]
    for key in expired_keys:
        del gallery_cache[key]
    
    # 清理gallery_imgs_cache
    expired_keys = [
        key for key, (cache_time, _) in gallery_imgs_cache.items()
        if current_time - cache_time > expire_time
    ]
    for key in expired_keys:
        del gallery_imgs_cache[key]
