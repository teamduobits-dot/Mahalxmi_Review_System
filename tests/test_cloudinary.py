"""Isolated regression tests: temporary SQLite/uploads and mocked Cloudinary only.
Run: .venv/bin/python -m unittest discover -s tests -p test_cloudinary.py -v
Never reads/writes the application's existing database or calls remote APIs.
"""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

os.environ['BACKEND_MODE'] = 'local'
os.environ['APP_ENV'] = 'development'
os.environ['IMAGE_STORAGE'] = 'cloudinary'
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

import database
import storage_service as storage
from fastapi.testclient import TestClient

PNG = b'\x89PNG\r\n\x1a\n' + b'test payload'
URL = 'https://res.cloudinary.com/n7m4rzvw/image/upload/v1/mahalaxmi-review-system/review-test.png'


class CloudinaryMigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.uploads = root / 'uploads'
        self.uploads.mkdir()
        self.patches = [
            patch.object(database, 'DB_PATH', root / 'test.db'),
            patch.object(database, 'UPLOADS_DIR', self.uploads),
            patch.object(storage, 'UPLOADS_DIR', self.uploads),
            patch.dict(os.environ, {
                'CLOUDINARY_CLOUD_NAME': 'n7m4rzvw',
                'CLOUDINARY_API_KEY': 'test-key',
                'CLOUDINARY_API_SECRET': 'test-secret',
            }),
            patch('cloudinary.uploader.upload', return_value={'secure_url': URL, 'public_id': 'not-used'}),
            patch('cloudinary.uploader.destroy'),
        ]
        self.mocks = [p.start() for p in self.patches]
        # Import after redirecting paths, so the /uploads mount is isolated too.
        import main
        # Each test has a fresh temporary upload directory.
        for route in main.app.routes:
            if getattr(route, 'path', None) == '/uploads':
                route.app.directory = str(self.uploads)
                route.app.all_directories = [str(self.uploads)]
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def submit(self, qr=False, content=PNG):
        files = {'reviewScreenshot': ('proof.png', content, 'image/png')}
        if qr:
            files['upiQr'] = ('qr.png', PNG, 'image/png')
        return self.client.post('/api/submissions', data={
            'customerName': 'Migration Test', 'orderLast4': '9876',
            'payoutMethod': 'qr' if qr else 'upi', 'upiId': 'test@upi',
        }, files=files)

    def test_new_urls_stored_and_admin_delivers_them(self):
        response = self.submit(qr=True)
        self.assertEqual(response.status_code, 200, response.text)
        row = database.get_submission_by_reference(response.json()['reference'])
        self.assertEqual(row['review_screenshot_path'], URL)
        self.assertEqual(row['upi_qr_path'], URL)
        self.assertEqual(list(self.uploads.iterdir()), [])
        upload = self.mocks[4]
        self.assertEqual(upload.call_count, 2)
        self.assertEqual(upload.call_args.kwargs['folder'], 'mahalaxmi-review-system')
        self.assertFalse(upload.call_args.kwargs['overwrite'])
        self.client.post('/api/auth/login', data={
            'email': database.DEFAULT_ADMIN_EMAIL, 'password': database.DEFAULT_ADMIN_PASSWORD,
        })
        detail = self.client.get(f"/api/admin/submissions/{row['id']}")
        self.assertEqual(detail.json()['reviewScreenshotUrl'], URL)
        redirect = self.client.get(f"/api/admin/submissions/{row['id']}/files/review", follow_redirects=False)
        self.assertEqual(redirect.headers['location'], URL)

    def test_existing_local_file_preserved_and_served(self):
        target = self.uploads / 'review-old.png'
        target.write_bytes(PNG)
        old = database.create_submission({
            'customer_name': 'Legacy Test', 'order_last4': '1234',
            'review_screenshot_path': '/uploads/review-old.png',
            'payout_method': 'upi', 'upi_id': 'legacy@upi',
            'created_at': database.utc_now(),
        })
        self.assertEqual(self.submit().status_code, 200)
        self.assertEqual(database.get_submission_by_id(old['id']), old)
        self.assertEqual(self.client.get('/uploads/review-old.png').content, PNG)
        self.assertEqual(target.read_bytes(), PNG)
        self.assertEqual(storage.read_file('/uploads/review-old.png'), PNG)

    def test_invalid_and_oversize_images_rejected_before_sdk(self):
        for content in (b'<html>not an image</html>', PNG + bytes(5 * 1024 * 1024)):
            self.assertEqual(self.submit(content=content).status_code, 400)
        self.mocks[4].assert_not_called()
        self.assertEqual(database.list_submissions(), [])

    def test_supported_magic_bytes_and_cloudinary_url_validation(self):
        for content, extension in ((PNG, '.png'), (b'\xff\xd8\xfftest', '.jpg'),
                                   (b'RIFF0000WEBPtest', '.webp')):
            self.assertEqual(storage.validate_image_bytes(content), extension)
        self.assertFalse(storage.is_cloudinary_url('https://res.cloudinary.com.evil.test/x'))
        self.assertFalse(storage.is_cloudinary_url('http://res.cloudinary.com/x'))
        self.assertFalse(storage.is_cloudinary_url('/uploads/old.png'))

    def test_unconfigured_fails_without_local_fallback(self):
        with patch.dict(os.environ, {'CLOUDINARY_API_SECRET': ''}):
            self.assertEqual(self.submit().status_code, 503)
        self.mocks[4].assert_not_called()
        self.assertEqual(list(self.uploads.iterdir()), [])

    def test_sdk_failure_and_missing_url_create_no_rows(self):
        self.mocks[4].side_effect = RuntimeError('sensitive SDK detail')
        result = self.submit()
        self.assertEqual(result.status_code, 502)
        self.assertNotIn('sensitive', result.text)
        self.mocks[4].side_effect = None
        self.mocks[4].return_value = {}
        self.assertEqual(self.submit().status_code, 502)
        self.assertEqual(database.list_submissions(), [])

    def test_remote_delete_is_noop_even_with_matching_local_basename(self):
        target = self.uploads / 'review-test.png'
        target.write_bytes(PNG)
        storage.delete_file(URL)
        self.mocks[5].assert_not_called()
        self.assertEqual(target.read_bytes(), PNG)
        self.assertIsNone(storage._local_path(URL))

    def test_database_failure_never_destroys_cloudinary_asset(self):
        with patch.object(database, 'create_submission', side_effect=RuntimeError('db failure')):
            with self.assertRaises(RuntimeError):
                self.submit()
        self.mocks[5].assert_not_called()
        self.assertEqual(database.list_submissions(), [])


if __name__ == '__main__':
    unittest.main()
