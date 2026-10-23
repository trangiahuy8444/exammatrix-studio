#!/usr/bin/env python3
"""Open one private local instance without creating competing writers."""
from pathlib import Path
import fcntl
import json
import sys
import webbrowser
from server import APP_DIR, DEFAULT_BANK, create_server

def main():
    data=APP_DIR/'data';data.mkdir(exist_ok=True)
    handle=(data/'.server.lock').open('a+')
    try:
        fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        handle.seek(0)
        try:port=json.load(handle)['port']
        except (ValueError,KeyError):
            print('Ứng dụng đang khởi động. Vui lòng mở lại sau vài giây.');return 1
        url=f'http://127.0.0.1:{port}'
        print(f'Ứng dụng đang chạy: {url}');webbrowser.open(url);return 0
    server=None
    for port in range(8765,8776):
        try:
            server=create_server(DEFAULT_BANK,data,data/'exam_templates.json',port=port);break
        except OSError:continue
    if server is None:
        print('Các cổng 8765–8775 đang bận. Vui lòng đóng phiên cũ rồi mở lại.');return 1
    handle.seek(0);handle.truncate();json.dump({'port':port},handle);handle.flush()
    url=f'http://127.0.0.1:{port}'
    print('NGÂN HÀNG ĐỀ TIN HỌC — CHỈ DÙNG TRÊN MÁY NÀY')
    print(f'Mở {url}\nGiữ cửa sổ này khi sử dụng. Nhấn Ctrl+C để dừng.',flush=True)
    webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:print('\nĐã dừng ứng dụng.')
    finally:server.server_close();handle.close()
    return 0

if __name__=='__main__':raise SystemExit(main())
