from flask import Blueprint, jsonify, request, make_response
from flask_cors import CORS
import asyncio
import aiohttp
from functools import partial

# 创建蓝图
resources_bp = Blueprint('resources', __name__)
CORS(resources_bp)  # 为蓝图启用 CORS

async def fetch_image_url(session):
    """异步获取单张图片URL"""
    try:
        async with session.get('https://www.dmoe.cc/random.php?type=mobile&4', allow_redirects=True) as response:
            if response.status == 200:
                final_url = str(response.url)
                print("API Response:", final_url)
                return final_url
    except Exception as e:
        print(f"Error fetching image: {str(e)}")
        return None

async def fetch_multiple_images(count):
    """异步获取多张图片URL"""
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_image_url(session) for _ in range(count)]
        results = await asyncio.gather(*tasks)
        return [url for url in results if url]

@resources_bp.route('/api/random-image')
def get_random_image():
    """获取随机图片"""
    try:
        count = request.args.get('count', 1, type=int)
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        image_urls = loop.run_until_complete(fetch_multiple_images(count))
        
        # 创建响应
        if count == 1:
            response_data = {
                'success': True,
                'data': {
                    'image_url': image_urls[0]
                }
            }
        else:
            response_data = {
                'success': True,
                'data': {
                    'image_urls': image_urls
                }
            }
        
        # 使用make_response创建响应对象
        response = make_response(jsonify(response_data))
        # 设置响应头，指定UTF-8编码
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
            
    except Exception as e:
        print("Error fetching random image:", str(e))
        error_response = make_response(jsonify({
            'success': False,
            'message': '服务器错误'
        }), 500)
        error_response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return error_response
