from flask import Blueprint, jsonify, request
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
    """获取随机图片
    
    从 dmoe.cc 获取随机动漫图片
    
    参数:
        count: 获取图片数量（可选，默认1）
    
    返回:
        成功: 图片URL列表
        失败: 错误信息
    """
    try:
        # 获取请求参数
        count = request.args.get('count', 1, type=int)
        
        # 创建事件循环
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # 执行异步请求
        image_urls = loop.run_until_complete(fetch_multiple_images(count))
        
        # 如果只请求一张图片，保持原有的返回格式
        if count == 1:
            return jsonify({
                'success': True,
                'data': {
                    'image_url': image_urls[0]
                }
            })
        
        # 多张图片时返回数组
        return jsonify({
            'success': True,
            'data': {
                'image_urls': image_urls
            }
        })
            
    except Exception as e:
        print("Error fetching random image:", str(e))
        return jsonify({
            'success': False,
            'message': '服务器错误'
        }), 500
