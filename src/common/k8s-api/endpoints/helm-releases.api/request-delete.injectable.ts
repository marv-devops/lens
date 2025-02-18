/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { urlBuilderFor } from "../../../utils/buildUrl";
import { apiBaseInjectionToken } from "../../api-base";

export type RequestDeleteHelmRelease = (name: string, namespace: string) => Promise<void>;

const requestDeleteEndpoint = urlBuilderFor("/v2/releases/:namespace/:name");

const requestDeleteHelmReleaseInjectable = getInjectable({
  id: "request-delete-helm-release",
  instantiate: (di): RequestDeleteHelmRelease => {
    const apiBase = di.inject(apiBaseInjectionToken);

    return (name, namespace) => apiBase.del(requestDeleteEndpoint.compile({ name, namespace }));
  },
});

export default requestDeleteHelmReleaseInjectable;
