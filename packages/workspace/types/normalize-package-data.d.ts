declare module "normalize-package-data" {
  function normalizeData(parsedPackageJson: any, warnFn: (msg: string) => void, strict: boolean): void;

  export = normalizeData;
}
