(async function () {
  async function waitForEvCreateApiReady() {
    const until = (predicateFn, intervalMsec) => new Promise(resolve => {
      const poll = () => predicateFn() ? resolve() : setTimeout(poll, intervalMsec);
      poll();
    });
    await until(() => window.evCreate !== undefined, 500);
    await window.evCreate.config.WhenApiReady();
  }


  async function addModelToNewPages() {
    await waitForEvCreateApiReady();

    const selected = await window.evCreate.object.selection.Get();
    if (!selected.length) return alert("Please select a 3D model.");
    const selectedAttr = await window.evCreate.object.GetAttributes(selected[0]);
    if (!selectedAttr || selectedAttr.type !== "model3D") return alert("Selected object is not a 3D model.");

    const modelInfo = await window.evCreate.object.model.GetModelInfo(selected[0], { recursive: true });

    // Label assemblies with hierarchical step numbers
    const labeledNodes = [];
    function labelAssemblies(node, path = [], levelIndex = {}) {
      if (node.isPart === false && typeof node.childrenCount === "number" && node.childrenCount > 1) {
        const level = path.length;
        levelIndex[level] = (levelIndex[level] || 0) + 1;
        const newPath = [...path.slice(0, level), levelIndex[level]];
        const label = newPath.join(".");
        const childObjectIds = (node.children || []).map(child => child.objectId);
        labeledNodes.push({ label, name: node.name, childrenCount: node.childrenCount, childObjectIds });
        Object.keys(levelIndex).map(Number).filter(lvl => lvl > level).forEach(lvl => delete levelIndex[lvl]);
        for (const child of node.children || []) labelAssemblies(child, newPath, levelIndex);
      } else {
        for (const child of node.children || []) labelAssemblies(child, path, levelIndex);
      }
    }

    labelAssemblies(modelInfo);

    // Sort deepest assemblies first, based on label depth and value
    labeledNodes.sort((a, b) => {
      const aParts = a.label.split('.').map(Number);
      const bParts = b.label.split('.').map(Number);
      const len = Math.min(aParts.length, bParts.length);
      for (let i = 0; i < len; i++) {
        if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
      }
      return bParts.length - aParts.length;
    });

    const selectedModel = selected[0];

    for (const node of labeledNodes) {
      const newPage = await window.evCreate.document.AddPage();
      await window.evCreate.document.SetCurrentPage(newPage);
      const [firstLayer] = await window.evCreate.page.GetLayers(newPage);
      await window.evCreate.page.SetCurrentLayer(firstLayer);

      const [dupedModel] = await window.evCreate.object.Duplicate([selectedModel], 0, 0);
      await window.evCreate.object.SetZOrder(dupedModel, { layer: firstLayer, index: 0 });

      await window.evCreate.edit3D.EditModel(dupedModel);
      const fullModelInfo = await window.evCreate.object.model.GetModelInfo(dupedModel, { recursive: true });

      const partIdsToHide = [];
      (function collectParts(node) {
        if (node.isPart) partIdsToHide.push({ partId: node.objectId });
        for (const child of node.children || []) collectParts(child);
      })(fullModelInfo);

      await window.evCreate.edit3D.SetPartVisible(partIdsToHide, false);
      const partIdsToShow = node.childObjectIds.map(id => ({ partId: id }));
      await window.evCreate.edit3D.SetPartVisible(partIdsToShow, true);
      await window.evCreate.edit3D.FitCameraTo();
      await window.evCreate.edit3D.Save();
    }
  }

  addModelToNewPages();
})();
