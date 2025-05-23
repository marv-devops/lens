/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { promiseExecFile } from "../../common/utils/promise-exec";
import type { ObjectEncodingOptions } from "fs";
import type { ExecFileOptions, ExecFileOptionsWithStringEncoding } from "child_process";
import { UserStore } from "../../common/user-store";
import { isChildProcessError } from "../../common/utils";
import { getLegacyGlobalDiForExtensionApi } from "../../extensions/as-legacy-globals-for-extension-api/legacy-global-di-for-extension-api";
import helmBinaryPathInjectable from "./helm-binary-path.injectable";

/**
 * ExecFile the bundled helm CLI
 * @returns STDOUT
 */
export async function execHelm(args: string[], { encoding, ...rest }: ObjectEncodingOptions & ExecFileOptions = {}): Promise<string> {
  const options: ExecFileOptionsWithStringEncoding = {
    encoding: encoding ?? "utf-8",
    ...rest,
  };
  const di = getLegacyGlobalDiForExtensionApi();
  const helmBinaryPath = di.inject(helmBinaryPathInjectable);

  try {
    const opts = { ...options };

    opts.env ??= { ...process.env };

    if (!opts.env.HTTPS_PROXY && UserStore.getInstance().httpsProxy) {
      opts.env.HTTPS_PROXY = UserStore.getInstance().httpsProxy;
    }

    const { stdout } = await promiseExecFile(helmBinaryPath, args, opts);

    return stdout;
  } catch (error) {
    if (isChildProcessError(error, "string")) {
      throw error.stderr || error;
    }

    throw error;
  }
}
