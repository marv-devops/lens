/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { LensRendererExtension } from "../../../extensions/lens-renderer-extension";
import rendererExtensionsInjectable from "../../../extensions/renderer-extensions.injectable";
import currentlyInClusterFrameInjectable from "../../routes/currently-in-cluster-frame.injectable";
import type { IComputedValue, ObservableMap } from "mobx";
import { action, computed, observable, runInAction } from "mobx";
import React from "react";
import { Router } from "react-router";
import allowedResourcesInjectable from "../../cluster-frame-context/allowed-resources.injectable";
import type { RenderResult } from "@testing-library/react";
import { fireEvent, queryByText } from "@testing-library/react";
import type { KubeResource } from "../../../common/rbac";
import type { DiContainer, Injectable } from "@ogre-tools/injectable";
import { getInjectable } from "@ogre-tools/injectable";
import mainExtensionsInjectable from "../../../extensions/main-extensions.injectable";
import { pipeline } from "@ogre-tools/fp";
import { filter, first, join, last, map, matches } from "lodash/fp";
import navigateToPreferencesInjectable from "../../../features/preferences/common/navigate-to-preferences.injectable";
import type { NavigateToHelmCharts } from "../../../common/front-end-routing/routes/cluster/helm/charts/navigate-to-helm-charts.injectable";
import navigateToHelmChartsInjectable from "../../../common/front-end-routing/routes/cluster/helm/charts/navigate-to-helm-charts.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import { ClusterFrameContext } from "../../cluster-frame-context/cluster-frame-context";
import type { Cluster } from "../../../common/cluster/cluster";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";
import clusterFrameContextInjectable from "../../cluster-frame-context/cluster-frame-context.injectable";
import startMainApplicationInjectable from "../../../main/start-main-application/start-main-application.injectable";
import startFrameInjectable from "../../start-frame/start-frame.injectable";
import type { NamespaceStore } from "../+namespaces/store";
import historyInjectable from "../../navigation/history.injectable";
import type { MinimalTrayMenuItem } from "../../../main/tray/electron-tray/electron-tray.injectable";
import electronTrayInjectable from "../../../main/tray/electron-tray/electron-tray.injectable";
import { getDiForUnitTesting as getRendererDi } from "../../getDiForUnitTesting";
import { getDiForUnitTesting as getMainDi } from "../../../main/getDiForUnitTesting";
import { overrideChannels } from "../../../test-utils/channel-fakes/override-channels";
import assert from "assert";
import { openMenu } from "react-select-event";
import userEvent from "@testing-library/user-event";
import lensProxyPortInjectable from "../../../main/lens-proxy/lens-proxy-port.injectable";
import type { Route } from "../../../common/front-end-routing/front-end-route-injection-token";
import type { NavigateToRouteOptions } from "../../../common/front-end-routing/navigate-to-route-injection-token";
import { navigateToRouteInjectionToken } from "../../../common/front-end-routing/navigate-to-route-injection-token";
import type { LensMainExtension } from "../../../extensions/lens-main-extension";
import type { LensExtension } from "../../../extensions/lens-extension";
import extensionInjectable from "../../../extensions/extension-loader/extension/extension.injectable";
import { renderFor } from "./renderFor";
import { RootFrame } from "../../frames/root-frame/root-frame";
import { ClusterFrame } from "../../frames/cluster-frame/cluster-frame";
import hostedClusterIdInjectable from "../../cluster-frame-context/hosted-cluster-id.injectable";
import activeKubernetesClusterInjectable from "../../cluster-frame-context/active-kubernetes-cluster.injectable";
import { catalogEntityFromCluster } from "../../../main/cluster/manager";
import namespaceStoreInjectable from "../+namespaces/store.injectable";
import { isAllowedResource } from "../../../common/cluster/is-allowed-resource";
import createApplicationWindowInjectable from "../../../main/start-main-application/lens-window/application-window/create-application-window.injectable";
import type { CreateElectronWindow } from "../../../main/start-main-application/lens-window/application-window/create-electron-window.injectable";
import createElectronWindowInjectable from "../../../main/start-main-application/lens-window/application-window/create-electron-window.injectable";
import { applicationWindowInjectionToken } from "../../../main/start-main-application/lens-window/application-window/application-window-injection-token";
import closeAllWindowsInjectable from "../../../main/start-main-application/lens-window/hide-all-windows/close-all-windows.injectable";
import type { LensWindow } from "../../../main/start-main-application/lens-window/application-window/create-lens-window.injectable";
import type { FakeExtensionOptions } from "./get-extension-fake";
import { getExtensionFakeForMain, getExtensionFakeForRenderer } from "./get-extension-fake";
import namespaceApiInjectable from "../../../common/k8s-api/endpoints/namespace.api.injectable";
import { Namespace } from "../../../common/k8s-api/endpoints";
import { overrideFsWithFakes } from "../../../test-utils/override-fs-with-fakes";
import applicationMenuItemCompositeInjectable from "../../../features/application-menu/main/application-menu-item-composite.injectable";
import { getCompositePaths } from "../../../common/utils/composite/get-composite-paths/get-composite-paths";
import { discoverFor } from "./discovery-of-html-elements";
import { findComposite } from "../../../common/utils/composite/find-composite/find-composite";
import shouldStartHiddenInjectable from "../../../main/electron-app/features/should-start-hidden.injectable";

type Callback = (di: DiContainer) => void | Promise<void>;

type LensWindowWithHelpers = LensWindow & { rendered: RenderResult; di: DiContainer };

const createNamespacesFor = (namespaces: Set<string>): Namespace[] => (
  Array.from(namespaces, (namespace) => new Namespace({
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: namespace,
      resourceVersion: "1",
      selfLink: `/api/v1/namespaces/${namespace}`,
      uid: `namespace-${namespace}`,
    },
  }))
);

export interface ApplicationBuilder {
  mainDi: DiContainer;
  setEnvironmentToClusterFrame: () => ApplicationBuilder;

  extensions: {
    enable: (...extensions: FakeExtensionOptions[]) => void;
    disable: (...extensions: FakeExtensionOptions[]) => void;

    get: (id: string) => {
      main: LensMainExtension;

      applicationWindows: Record<string, LensRendererExtension> & {
        only: LensRendererExtension;
      };
    };
  };

  applicationWindow: {
    closeAll: () => void;
    only: LensWindowWithHelpers;
    get: (id: string) => LensWindowWithHelpers;
    getAll: () => LensWindowWithHelpers[];
    create: (id: string) => LensWindowWithHelpers;
  };

  allowKubeResource: (resourceName: KubeResource) => ApplicationBuilder;
  beforeApplicationStart: (callback: Callback) => ApplicationBuilder;
  beforeWindowStart: (callback: Callback) => ApplicationBuilder;
  afterWindowStart: (callback: Callback) => ApplicationBuilder;

  startHidden: () => Promise<void>;
  render: () => Promise<RenderResult>;

  tray: {
    click: (id: string) => Promise<void>;
    get: (id: string) => MinimalTrayMenuItem | null;
    getIconPath: () => string;
  };

  applicationMenu: {
    click: (...path: string[]) => void;
    items: string[][];
  };
  preferences: {
    close: () => void;
    navigate: () => void;
    navigateTo: (route: Route<any>, params: Partial<NavigateToRouteOptions<any>>) => void;
    navigation: {
      click: (id: string) => void;
    };
  };
  namespaces: {
    add: (namespace: string) => void;
    select: (namespace: string) => void;
  };
  helmCharts: {
    navigate: NavigateToHelmCharts;
  };
  navigateWith: (token: Injectable<() => void, any, void>) => void;
  select: {
    openMenu: (id: string) => { selectOption: (labelText: string) => void };
    selectOption: (menuId: string, labelText: string) => void;
    getValue: (menuId: string) => string;
  };
}

interface Environment {
  RootComponent: React.ElementType;
  onAllowKubeResource: () => void;
}

export const getApplicationBuilder = () => {
  const mainDi = getMainDi({
    doGeneralOverrides: true,
  });

  runInAction(() => {
    mainDi.register(mainExtensionsStateInjectable);
  });

  const { overrideForWindow, sendToWindow } = overrideChannels(mainDi);

  const beforeApplicationStartCallbacks: Callback[] = [];
  const beforeWindowStartCallbacks: Callback[] = [];
  const afterWindowStartCallbacks: Callback[] = [];

  const fsState = new Map();

  overrideFsWithFakes(mainDi, fsState);

  let environment = environments.application;

  mainDi.override(mainExtensionsInjectable, (di) => {
    const mainExtensionsState = di.inject(mainExtensionsStateInjectable);

    return computed(() =>
      [...mainExtensionsState.values()],
    );
  });

  let trayMenuIconPath: string;

  const traySetMenuItemsMock = jest.fn<any, [MinimalTrayMenuItem[]]>();

  mainDi.override(electronTrayInjectable, () => ({
    start: () => {},
    stop: () => {},
    setMenuItems: traySetMenuItemsMock,
    setIconPath: (path) => {
      trayMenuIconPath = path;
    },
  }));

  const allowedResourcesState = observable.array<KubeResource>();

  const windowHelpers = new Map<string, { di: DiContainer; getRendered: () => RenderResult }>();

  const createElectronWindowFake: CreateElectronWindow = (configuration) => {
    const windowId = configuration.id;

    const windowDi = getRendererDi({ doGeneralOverrides: true });

    overrideForWindow(windowDi, windowId);
    overrideFsWithFakes(windowDi, fsState);

    runInAction(() => {
      windowDi.register(rendererExtensionsStateInjectable);
    });

    windowDi.override(
      currentlyInClusterFrameInjectable,
      () => environment === environments.clusterFrame,
    );

    windowDi.override(rendererExtensionsInjectable, (di) => {
      const rendererExtensionState = di.inject(rendererExtensionsStateInjectable);

      return computed(() => [...rendererExtensionState.values()]);
    });

    let rendered: RenderResult;

    windowHelpers.set(windowId, { di: windowDi, getRendered: () => rendered });

    return {
      show: () => {},
      close: () => {},
      loadFile: async () => {},
      loadUrl: async () => {
        for (const callback of beforeWindowStartCallbacks) {
          await callback(windowDi);
        }

        const startFrame = windowDi.inject(startFrameInjectable);

        await startFrame();

        for (const callback of afterWindowStartCallbacks) {
          await callback(windowDi);
        }

        const history = windowDi.inject(historyInjectable);

        const render = renderFor(windowDi);

        rendered = render(
          <Router history={history}>
            <environment.RootComponent />
          </Router>,
        );
      },

      send: (arg) => {
        sendToWindow(windowId, arg);
      },

      reload: () => {
        throw new Error("Tried to reload application window which is not implemented yet.");
      },
    };
  };

  mainDi.override(createElectronWindowInjectable, () => createElectronWindowFake);

  let applicationHasStarted = false;

  const namespaces = observable.set<string>();
  const namespaceItems = observable.array<Namespace>();
  const selectedNamespaces = observable.set<string>();

  const builder: ApplicationBuilder = {
    mainDi,
    applicationWindow: {
      closeAll: () => {
        const closeAll = mainDi.inject(closeAllWindowsInjectable);

        closeAll();

        document.documentElement.innerHTML = "";
      },

      get only() {
        const applicationWindows = builder.applicationWindow.getAll();

        if (applicationWindows.length > 1) {
          throw new Error(
            "Tried to get only application window when there are multiple windows.",
          );
        }

        const applicationWindow = first(applicationWindows);

        if (!applicationWindow) {
          throw new Error(
            "Tried to get only application window when there are no windows.",
          );
        }

        return applicationWindow;
      },

      getAll: () =>
        mainDi
          .injectMany(applicationWindowInjectionToken)
          .map(toWindowWithHelpersFor(windowHelpers)),

      get: (id) => {
        const applicationWindow = builder.applicationWindow
          .getAll()
          .find((window) => window.id === id);

        if (!applicationWindow) {
          throw new Error(`Tried to get application window with ID "${id}" but it was not found.`);
        }

        return applicationWindow;
      },

      create: (id) => {
        const createApplicationWindow = mainDi.inject(createApplicationWindowInjectable);

        createApplicationWindow(id);

        return builder.applicationWindow.get(id);
      },
    },
    namespaces: {
      add: action((namespace) => {
        namespaces.add(namespace);
        namespaceItems.replace(createNamespacesFor(namespaces));
      }),
      select: action((namespace) => selectedNamespaces.add(namespace)),
    },
    applicationMenu: {
      get items() {
        const composite = mainDi.inject(
          applicationMenuItemCompositeInjectable,
        ).get();

        return getCompositePaths(composite);
      },

      click: (...path: string[]) => {
        const composite = mainDi.inject(
          applicationMenuItemCompositeInjectable,
        ).get();

        const clickableMenuItem = findComposite(...path)(composite).value;

        if(clickableMenuItem.kind === "clickable-menu-item") {
          // Todo: prevent leaking of Electron
          (clickableMenuItem.onClick as any)();
        } else {
          throw new Error(`Tried to trigger clicking of an application menu item, but item at path '${path.join(" -> ")}' isn't clickable.`);
        }
      },
    },

    tray: {
      get: (id: string) => {
        const lastCall = last(traySetMenuItemsMock.mock.calls);

        assert(lastCall);

        return lastCall[0].find(matches({ id })) ?? null;
      },

      getIconPath: () => trayMenuIconPath,

      click: async (id: string) => {
        const lastCall = last(traySetMenuItemsMock.mock.calls);

        assert(lastCall);

        const trayMenuItems = lastCall[0];

        const menuItem = trayMenuItems.find(matches({ id })) ?? null;

        if (!menuItem) {
          const availableIds = pipeline(
            trayMenuItems,
            filter(item => !!item.click),
            map(item => item.id),
            join(", "),
          );

          throw new Error(`Tried to click tray menu item with ID ${id} which does not exist. Available IDs are: "${availableIds}"`);
        }

        if (!menuItem.enabled) {
          throw new Error(`Tried to click tray menu item with ID ${id} which is disabled.`);
        }

        await menuItem.click?.();
      },
    },

    preferences: {
      close: () => {
        const rendered = builder.applicationWindow.only.rendered;

        const link = rendered.getByTestId("close-preferences");

        fireEvent.click(link);
      },

      navigate: () => {
        const windowDi = builder.applicationWindow.only.di;

        const navigateToPreferences = windowDi.inject(
          navigateToPreferencesInjectable,
        );

        navigateToPreferences();
      },

      navigateTo: (route: Route<any>, params: Partial<NavigateToRouteOptions<any>>) => {
        const windowDi = builder.applicationWindow.only.di;

        const navigateToRoute = windowDi.inject(navigateToRouteInjectionToken);

        navigateToRoute(route, params);
      },

      navigation: {
        click: (pathId: string) => {
          const { rendered } = builder.applicationWindow.only;

          const discover = discoverFor(() => rendered);

          const { discovered: link } = discover.getSingleElement(
            "preference-tab-link",
            pathId,
          );

          fireEvent.click(link);
        },
      },
    },

    helmCharts: {
      navigate: (parameters) => {
        const windowDi = builder.applicationWindow.only.di;

        const navigateToHelmCharts = windowDi.inject(
          navigateToHelmChartsInjectable,
        );

        navigateToHelmCharts(parameters);
      },
    },

    navigateWith: (token) => {
      const windowDi = builder.applicationWindow.only.di;
      const navigate = windowDi.inject(token);

      navigate();
    },

    setEnvironmentToClusterFrame: () => {
      environment = environments.clusterFrame;

      builder.beforeWindowStart((windowDi) => {
        windowDi.override(allowedResourcesInjectable, () =>
          computed(() => new Set([...allowedResourcesState])),
        );

        const clusterStub = {
          id: "some-cluster-id",
          accessibleNamespaces: [],
          isAllowedResource: isAllowedResource(allowedResourcesState),
        } as unknown as Cluster;

        windowDi.override(activeKubernetesClusterInjectable, () =>
          computed(() => catalogEntityFromCluster(clusterStub)),
        );

        windowDi.override(hostedClusterIdInjectable, () => clusterStub.id);

        // TODO: Figure out a way to remove this stub.
        const namespaceStoreStub = {
          isLoaded: true,
          get contextNamespaces() {
            return Array.from(selectedNamespaces);
          },
          get allowedNamespaces() {
            return Array.from(namespaces);
          },
          contextItems: namespaceItems,
          api: windowDi.inject(namespaceApiInjectable),
          items: namespaceItems,
          selectNamespaces: () => {},
          selectSingle: () => {},
          getByPath: () => undefined,
          pickOnlySelected: () => [],
          isSelectedAll: () => false,
          getTotalCount: () => namespaceItems.length,
        } as Partial<NamespaceStore> as NamespaceStore;

        const clusterFrameContextFake = new ClusterFrameContext(
          clusterStub,

          {
            namespaceStore: namespaceStoreStub,
          },
        );

        windowDi.override(namespaceStoreInjectable, () => namespaceStoreStub);
        windowDi.override(hostedClusterInjectable, () => clusterStub);
        windowDi.override(clusterFrameContextInjectable, () => clusterFrameContextFake);

        // Todo: get rid of global state.
        KubeObjectStore.defaultContext.set(clusterFrameContextFake);
      });

      return builder;
    },

    extensions: {
      get: (id: string) => {
        const windowInstances = pipeline(
          builder.applicationWindow.getAll(),

          map((window): [string, LensRendererExtension] => [
            window.id,
            findExtensionInstance(window.di, rendererExtensionsInjectable, id),
          ]),

          items => Object.fromEntries(items),
        );

        return {
          main: findExtensionInstance(mainDi, mainExtensionsInjectable, id),

          applicationWindows: {
            get only() {
              return findExtensionInstance(
                builder.applicationWindow.only.di,
                rendererExtensionsInjectable,
                id,
              );
            },

            ...windowInstances,
          },
        };
      },

      enable: (...extensions) => {
        builder.beforeWindowStart((windowDi) => {
          const rendererExtensionInstances = extensions.map((options) =>
            getExtensionFakeForRenderer(
              windowDi,
              options.id,
              options.name,
              options.rendererOptions || {},
            ),
          );

          rendererExtensionInstances.forEach(
            enableExtensionFor(windowDi, rendererExtensionsStateInjectable),
          );
        });

        builder.beforeApplicationStart((mainDi) => {
          const mainExtensionInstances = extensions.map((extension) =>
            getExtensionFakeForMain(mainDi, extension.id, extension.name, extension.mainOptions || {}),
          );

          runInAction(() => {
            mainExtensionInstances.forEach(
              enableExtensionFor(mainDi, mainExtensionsStateInjectable),
            );
          });
        });
      },

      disable: (...extensions) => {
        builder.beforeWindowStart(windowDi => {
          extensions
            .map((ext) => ext.id)
            .forEach(
              disableExtensionFor(windowDi, rendererExtensionsStateInjectable),
            );
        });

        builder.beforeApplicationStart(mainDi => {
          extensions
            .map((ext) => ext.id)
            .forEach(
              disableExtensionFor(mainDi, mainExtensionsStateInjectable),
            );
        });
      },
    },

    allowKubeResource: (resourceName) => {
      environment.onAllowKubeResource();

      runInAction(() => {
        allowedResourcesState.push(resourceName);
      });

      return builder;
    },

    beforeApplicationStart(callback) {
      if (applicationHasStarted) {
        callback(mainDi);
      }

      beforeApplicationStartCallbacks.push(callback);

      return builder;
    },

    beforeWindowStart(callback) {
      const alreadyRenderedWindows = builder.applicationWindow.getAll();

      alreadyRenderedWindows.forEach((window) => {
        callback(window.di);
      });

      beforeWindowStartCallbacks.push(callback);

      return builder;
    },

    afterWindowStart(callback) {
      const alreadyRenderedWindows = builder.applicationWindow.getAll();

      alreadyRenderedWindows.forEach((window) => {
        callback(window.di);
      });

      afterWindowStartCallbacks.push(callback);

      return builder;
    },

    startHidden: async () => {
      mainDi.inject(lensProxyPortInjectable).set(42);

      for (const callback of beforeApplicationStartCallbacks) {
        await callback(mainDi);
      }

      mainDi.override(shouldStartHiddenInjectable, () => true);
      await mainDi.inject(startMainApplicationInjectable);

      applicationHasStarted = true;
    },

    async render() {
      mainDi.inject(lensProxyPortInjectable).set(42);

      for (const callback of beforeApplicationStartCallbacks) {
        await callback(mainDi);
      }

      mainDi.override(shouldStartHiddenInjectable, () => false);
      await mainDi.inject(startMainApplicationInjectable);

      applicationHasStarted = true;

      return builder
        .applicationWindow
        .get("first-application-window")
        .rendered;
    },

    select: {
      openMenu: (menuId) => {
        const rendered = builder.applicationWindow.only.rendered;

        const select = rendered.baseElement.querySelector<HTMLElement>(
          `#${menuId}`,
        );

        assert(select, `Could not find select with ID "${menuId}"`);

        openMenu(select);

        return {
          selectOption: selectOptionFor(builder, menuId),
        };
      },

      selectOption: (menuId, labelText) => selectOptionFor(builder, menuId)(labelText),

      getValue: (menuId) => {
        const rendered = builder.applicationWindow.only.rendered;

        const select = rendered.baseElement.querySelector<HTMLInputElement>(
          `#${menuId}`,
        );

        assert(select, `Could not find select with ID "${menuId}"`);

        const controlElement = select.closest(".Select__control");

        assert(controlElement, `Could not find select value for menu with ID "${menuId}"`);

        return controlElement.textContent || "";
      },
    },
  };

  return builder;
};

export const rendererExtensionsStateInjectable = getInjectable({
  id: "renderer-extensions-state",
  instantiate: () => observable.map<string, LensRendererExtension>(),
});

const mainExtensionsStateInjectable = getInjectable({
  id: "main-extensions-state",
  instantiate: () => observable.map<string, LensMainExtension>(),
});

const findExtensionInstance = <T extends LensExtension> (di: DiContainer, injectable: Injectable<IComputedValue<T[]>, any, any>, id: string) => {
  const instance = di.inject(injectable).get().find(ext => ext.id === id);

  if (!instance) {
    throw new Error(`Tried to get extension with ID ${id}, but it didn't exist`);
  }

  return instance;
};

type ApplicationWindowHelpers = Map<string, { di: DiContainer; getRendered: () => RenderResult }>;

const toWindowWithHelpersFor =
  (windowHelpers: ApplicationWindowHelpers) => (applicationWindow: LensWindow) => ({
    ...applicationWindow,

    get rendered() {
      const helpers = windowHelpers.get(applicationWindow.id);

      if (!helpers) {
        throw new Error(
          `Tried to get rendered for application window "${applicationWindow.id}" before it was started.`,
        );
      }

      return helpers.getRendered();
    },

    get di() {
      const helpers = windowHelpers.get(applicationWindow.id);

      if (!helpers) {
        throw new Error(
          `Tried to get di for application window "${applicationWindow.id}" before it was started.`,
        );
      }

      return helpers.di;
    },
  });

const environments = {
  application: {
    RootComponent: RootFrame,

    onAllowKubeResource: () => {
      throw new Error(
        "Tried to allow kube resource when environment is not cluster frame.",
      );
    },
  } as Environment,

  clusterFrame: {
    RootComponent: ClusterFrame,
    onAllowKubeResource: () => {},
  } as Environment,
};

const selectOptionFor = (builder: ApplicationBuilder, menuId: string) => (labelText: string) => {
  const rendered = builder.applicationWindow.only.rendered;

  const menuOptions = rendered.baseElement.querySelector<HTMLElement>(
    `.${menuId}-options`,
  );

  assert(menuOptions, `Could not find select options for menu with ID "${menuId}"`);

  const option = queryByText(menuOptions, labelText);

  assert(option, `Could not find select option with label "${labelText}" for menu with ID "${menuId}"`);

  userEvent.click(option);
};

const enableExtensionFor = (
  di: DiContainer,
  stateInjectable: Injectable<ObservableMap<string, any>, any, any>,
) => {
  const extensionState = di.inject(stateInjectable);

  const getExtension = (extension: LensExtension) =>
    di.inject(extensionInjectable, extension);

  return (extensionInstance: LensExtension) => {
    const extension = getExtension(extensionInstance);

    runInAction(() => {
      extension.register();
      extensionState.set(extensionInstance.id, extensionInstance);
    });
  };
};

const disableExtensionFor =
  (
    di: DiContainer,
    stateInjectable: Injectable<ObservableMap<string, any>, unknown, void>,
  ) =>
    (id: string) => {
      const getExtension = (extension: LensExtension) =>
        di.inject(extensionInjectable, extension);

      const extensionsState = di.inject(stateInjectable);

      const instance = extensionsState.get(id);

      if (!instance) {
        throw new Error(
          `Tried to disable extension with ID "${id}", but it wasn't enabled`,
        );
      }

      const injectable = getExtension(instance);

      runInAction(() => {
        injectable.deregister();

        extensionsState.delete(id);
      });
    };
