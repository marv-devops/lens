/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./daemonsets.scss";

import React from "react";
import { observer } from "mobx-react";
import type { DaemonSet } from "../../../common/k8s-api/endpoints";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { Badge } from "../badge";
import { KubeObjectStatusIcon } from "../kube-object-status-icon";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { KubeObjectAge } from "../kube-object/age";
import type { DaemonSetStore } from "./store";
import type { PodStore } from "../+workloads-pods/store";
import type { EventStore } from "../+events/store";
import { prevDefault } from "../../utils";
import type { FilterByNamespace } from "../+namespaces/namespace-select-filter-model/filter-by-namespace.injectable";
import { withInjectables } from "@ogre-tools/injectable-react";
import daemonSetStoreInjectable from "./store.injectable";
import eventStoreInjectable from "../+events/store.injectable";
import filterByNamespaceInjectable from "../+namespaces/namespace-select-filter-model/filter-by-namespace.injectable";
import podStoreInjectable from "../+workloads-pods/store.injectable";

enum columnId {
  name = "name",
  namespace = "namespace",
  pods = "pods",
  labels = "labels",
  age = "age",
}

interface Dependencies {
  daemonSetStore: DaemonSetStore;
  podStore: PodStore;
  eventStore: EventStore;
  filterByNamespace: FilterByNamespace;
}

@observer
class NonInjectedDaemonSets extends React.Component<Dependencies> {
  getPodsLength(daemonSet: DaemonSet) {
    return this.props.daemonSetStore.getChildPods(daemonSet).length;
  }

  render() {
    const {
      daemonSetStore,
      eventStore,
      filterByNamespace,
      podStore,
    } = this.props;

    return (
      <SiblingsInTabLayout>
        <KubeObjectListLayout
          isConfigurable
          tableId="workload_daemonsets"
          className="DaemonSets"
          store={daemonSetStore}
          dependentStores={[podStore, eventStore]} // status icon component uses event store
          sortingCallbacks={{
            [columnId.name]: daemonSet => daemonSet.getName(),
            [columnId.namespace]: daemonSet => daemonSet.getNs(),
            [columnId.pods]: daemonSet => this.getPodsLength(daemonSet),
            [columnId.age]: daemonSet => -daemonSet.getCreationTimestamp(),
          }}
          searchFilters={[
            daemonSet => daemonSet.getSearchFields(),
            daemonSet => daemonSet.getLabels(),
          ]}
          renderHeaderTitle="Daemon Sets"
          renderTableHeader={[
            { title: "Name", className: "name", sortBy: columnId.name, id: columnId.name },
            { title: "Namespace", className: "namespace", sortBy: columnId.namespace, id: columnId.namespace },
            { title: "Pods", className: "pods", sortBy: columnId.pods, id: columnId.pods },
            { className: "warning", showWithColumn: columnId.pods },
            { title: "Node Selector", className: "labels scrollable", id: columnId.labels },
            { title: "Age", className: "age", sortBy: columnId.age, id: columnId.age },
          ]}
          renderTableContents={daemonSet => [
            daemonSet.getName(),
            <a
              key="namespace"
              className="filterNamespace"
              onClick={prevDefault(() => filterByNamespace(daemonSet.getNs()))}
            >
              {daemonSet.getNs()}
            </a>,
            this.getPodsLength(daemonSet),
            <KubeObjectStatusIcon key="icon" object={daemonSet} />,
            daemonSet.getNodeSelectors().map(selector => (
              <Badge
                key={selector}
                label={selector}
                scrollable
              />
            )),
            <KubeObjectAge key="age" object={daemonSet} />,
          ]}
        />
      </SiblingsInTabLayout>
    );
  }
}

export const DaemonSets = withInjectables<Dependencies>(NonInjectedDaemonSets, {
  getProps: (di, props) => ({
    ...props,
    daemonSetStore: di.inject(daemonSetStoreInjectable),
    eventStore: di.inject(eventStoreInjectable),
    filterByNamespace: di.inject(filterByNamespaceInjectable),
    podStore: di.inject(podStoreInjectable),
  }),
});
