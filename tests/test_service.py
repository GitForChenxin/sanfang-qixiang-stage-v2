"""Exercise actual HTTP serving, MIME types and deployment isolation."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import importlib.util
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("static_service", ROOT / "deploy/server.py")
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class ServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), partial(service.Handler, directory=str(ROOT / ".site")))
        cls.thread = Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.http.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def test_site_and_javascript_mime(self):
        for path in ["/", "/renderer.mjs", "/heart-tree.mjs", "/data/district-osm.json", "/assets/pbr/manifest.json", "/assets/renders/front.png"]:
            with self.subTest(path=path), urlopen(self.base + path) as response:
                self.assertEqual(response.status, 200)
                if path.endswith(".mjs"):
                    self.assertEqual(response.headers.get_content_type(), "text/javascript")
                self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
                self.assertTrue(response.read())

    def test_health(self):
        with urlopen(self.base + "/healthz") as response:
            self.assertIn(b'"status": "ok"', response.read())

    def test_source_credentials_and_listing_not_exposed(self):
        for path in ["/.git/config", "/%2e%2e/package.json", "/package.json", "/server.py", "/colab/pipeline.py", "/assets/", "/.env"]:
            with self.subTest(path=path), self.assertRaises(HTTPError) as error:
                urlopen(self.base + path)
            self.assertEqual(error.exception.code, 404)

    def test_scene_upload_not_exposed(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(Request(self.base + "/_scene", data=b"{}", headers={"Content-Type": "application/json"}))
        self.assertEqual(error.exception.code, 405)


if __name__ == "__main__":
    unittest.main()
