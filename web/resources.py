from flask import Blueprint, jsonify, request, make_response
from flask_cors import CORS
import asyncio
import aiohttp
import logging

# 设置日志
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# 创建蓝图
resources_bp = Blueprint('resources', __name__)
CORS(resources_bp)

async def fetch_image_url(session):
    """异步获取单张图片URL"""
    api = 'https://www.dmoe.cc/random.php?type=mobile&4'
    
    try:
        logger.debug(f"Attempting to fetch image from: {api}")
        async with session.get(api, allow_redirects=True, timeout=5) as response:
            logger.debug(f"Response status: {response.status}")
            logger.debug(f"Response headers: {response.headers}")
            
            if response.status == 200:
                final_url = str(response.url)
                logger.info(f"Successfully fetched image URL: {final_url}")
                return final_url
            else:
                logger.error(f"Failed to fetch image. Status code: {response.status}")
                response_text = await response.text()
                logger.error(f"Response text: {response_text}")
                return None
                
    except aiohttp.ClientError as e:
        logger.error(f"Network error: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return None

async def fetch_multiple_images(count):
    """异步获取多张图片URL"""
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        connector = aiohttp.TCPConnector(ssl=False)  # 禁用SSL验证以便调试
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            tasks = [fetch_image_url(session) for _ in range(count)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 记录每个请求的结果
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"Request {i} failed with error: {str(result)}")
                else:
                    logger.debug(f"Request {i} succeeded with URL: {result}")
            
            valid_urls = [url for url in results if url and isinstance(url, str)]
            return valid_urls if valid_urls else None
            
    except Exception as e:
        logger.error(f"Error in fetch_multiple_images: {str(e)}")
        return None

def run_async(coro):
    """安全地运行异步代码的辅助函数"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    except Exception as e:
        logger.error(f"Error in run_async: {str(e)}")
        return None
    finally:
        try:
            loop.close()
        except Exception as e:
            logger.error(f"Error closing event loop: {str(e)}")

@resources_bp.route('/api/random-image')
def get_random_image():
    """获取随机图片"""
    try:
        count = request.args.get('count', 1, type=int)
        count = min(max(1, count), 10)
        
        logger.info(f"Received request for {count} images")
        
        image_urls = run_async(fetch_multiple_images(count))
        
        if not image_urls:
            logger.error("Failed to fetch any valid image URLs")
            return make_response(jsonify({
                'success': False,
                'error': 'Failed to fetch images',
                'message': '无法获取图片'
            }), 500)
        
        response_data = {
            'success': True,
            'data': {
                'image_url': image_urls[0] if count == 1 else None,
                'image_urls': image_urls if count > 1 else None
            }
        }
        
        response = make_response(jsonify(response_data))
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
            
    except Exception as e:
        logger.error(f"Error in get_random_image: {str(e)}", exc_info=True)
        return make_response(jsonify({
            'success': False,
            'error': str(e),
            'message': '服务器错误'
        }), 500)
