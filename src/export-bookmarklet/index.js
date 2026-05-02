javascript: (async function () {
  const dbName = "savedAIChatData";
  if (!dbName) return;

  try {
    const data = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);

      req.onerror = () => reject(new Error(`Failed to open: ${req.error}`));

      req.onsuccess = async (e) => {
        const db = e.target.result;
        const exp = { databaseName: db.name, version: db.version, stores: {} };

        try {
          const stores = Array.from(db.objectStoreNames);
          const tx = db.transaction(stores, "readonly");

          await Promise.all(
            stores.map(
              (s) =>
                new Promise((res, rej) => {
                  const os = tx.objectStore(s);
                  const r = os.getAll();

                  r.onsuccess = () => {
                    exp.stores[s] = {
                      keyPath: os.keyPath,
                      autoIncrement: os.autoIncrement,
                      indexes: Array.from(os.indexNames).map((i) => {
                        const idx = os.index(i);
                        return {
                          name: idx.name,
                          keyPath: idx.keyPath,
                          unique: idx.unique,
                          multiEntry: idx.multiEntry,
                        };
                      }),
                      data: r.result,
                    };
                    res();
                  };

                  r.onerror = () => rej(new Error(`Failed: ${r.error}`));
                }),
            ),
          );

          db.close();

          const json = JSON.stringify(exp, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${dbName}_${new Date().toISOString().replace(/:/g, "-")}.json`;

          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          URL.revokeObjectURL(url);

          resolve(exp);
        } catch (err) {
          db.close();

          reject(err);
        }
      };

      req.onupgradeneeded = () => {
        req.transaction.abort();
        reject(new Error("DB does not exist"));
      };
    });

    alert("Export successful! File downloaded.");
    console.log(data);
  } catch (err) {
    alert("Export failed: " + err.message);
    console.error(err);
  }
})();
