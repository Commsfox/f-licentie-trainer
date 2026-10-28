/// <reference path="../pb_data/types.d.ts" />
// Voortgang mag groter worden: wie alles gemaakt en gelezen heeft, zit al rond de 200 kB.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("progress");
  collection.fields.getByName("data").maxSize = 2000000;
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("progress");
  collection.fields.getByName("data").maxSize = 200000;
  app.save(collection);
});
