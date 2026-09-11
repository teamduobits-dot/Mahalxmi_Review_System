"""In-memory fakes of the tiny Firestore + Storage surface the app uses.

Used by smoke_firebase.py to validate the firebase-mode repository without
GCP credentials. Implements only what firestore_service.py and
storage_service.py call — nothing more.
"""
from __future__ import annotations


class FakeSnapshot:
    def __init__(self, doc_id: str, data: dict | None):
        self.id = doc_id
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict | None:
        return dict(self._data) if self._data is not None else None


class _FakeDocRef:
    def __init__(self, store: dict, path: str):
        self._store = store
        self.path = path

    @property
    def id(self) -> str:
        return self.path.rsplit("/", 1)[-1]

    def get(self) -> FakeSnapshot:
        data = self._store.get(self.path)
        return FakeSnapshot(self.id, dict(data) if data is not None else None)

    def set(self, data: dict, merge: bool = False) -> None:
        if merge and self.path in self._store:
            merged = dict(self._store[self.path])
            merged.update(data)
            self._store[self.path] = merged
        else:
            self._store[self.path] = dict(data)

    def update(self, data: dict) -> None:
        if self.path not in self._store:
            raise KeyError(f"No document to update at {self.path}")
        self._store[self.path].update(data)

    def delete(self) -> None:
        self._store.pop(self.path, None)


class _FakeQuery:
    def __init__(self, store: dict, collection: str, filters=(), limit_n: int | None = None):
        self._store = store
        self._collection = collection
        self._filters = tuple(filters)
        self._limit = limit_n

    def where(self, field: str, op: str, value) -> "_FakeQuery":
        return _FakeQuery(self._store, self._collection, self._filters + ((field, op, value),), self._limit)

    def limit(self, n: int) -> "_FakeQuery":
        return _FakeQuery(self._store, self._collection, self._filters, n)

    def stream(self):
        prefix = f"{self._collection}/"
        emitted = 0
        for path, data in sorted(self._store.items()):
            if not path.startswith(prefix) or path.count("/") != 1:
                continue
            doc_id = path[len(prefix):]
            ok = True
            for field, op, value in self._filters:
                actual = data.get(field)
                if op == "==" and actual != value:
                    ok = False
                elif op == ">=" and not (actual is not None and actual >= value):
                    ok = False
            if not ok:
                continue
            yield FakeSnapshot(doc_id, dict(data))
            emitted += 1
            if self._limit is not None and emitted >= self._limit:
                return


class _FakeCollection(_FakeQuery):
    def document(self, doc_id: str) -> _FakeDocRef:
        return _FakeDocRef(self._store, f"{self._collection}/{doc_id}")


class _FakeTransaction:
    def __init__(self, store: dict):
        self._store = store
        self._read_only = False

    def get(self, doc_ref: _FakeDocRef) -> FakeSnapshot:
        return doc_ref.get()

    def set(self, doc_ref: _FakeDocRef, data: dict, merge: bool = False) -> None:
        doc_ref.set(data, merge=merge)

    def _begin(self):
        pass

    def _rollback(self):
        pass

    def _commit(self):
        pass


class FakeFirestoreClient:
    def __init__(self):
        self.store: dict[str, dict] = {}

    def document(self, path: str) -> _FakeDocRef:
        return _FakeDocRef(self.store, path)

    def collection(self, name: str) -> _FakeCollection:
        return _FakeCollection(self.store, name)

    def transaction(self) -> _FakeTransaction:
        return _FakeTransaction(self.store)


class _FakeBlob:
    def __init__(self, bucket: "FakeBucket", name: str):
        self._bucket = bucket
        self.name = name

    @property
    def size(self) -> int:
        return len(self._bucket.objects.get(self.name, b""))

    def upload_from_string(self, content: bytes, content_type: str | None = None) -> None:
        self._bucket.objects[self.name] = bytes(content)

    def exists(self) -> bool:
        return self.name in self._bucket.objects

    def download_as_bytes(self) -> bytes:
        return self._bucket.objects[self.name]


class FakeBucket:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def blob(self, name: str) -> _FakeBlob:
        return _FakeBlob(self, name)

    def delete_blob(self, name: str) -> None:
        if name not in self.objects:
            raise KeyError(f"No such object: {name}")
        del self.objects[name]

    def list_blobs(self, prefix: str = ""):
        return [_FakeBlob(self, name) for name in sorted(self.objects) if name.startswith(prefix)]
