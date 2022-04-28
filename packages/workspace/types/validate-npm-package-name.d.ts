declare module "validate-npm-package-name" {
  namespace validate {
    interface PackageNameValidationResult {
      validForNewPackages: boolean;
      validForOldPackages: boolean;
      errors?: string[] | undefined;
    }
  }

  /**
   * https://github.com/npm/validate-npm-package-name
   *
   * Give me a string and I'll tell you if it's a valid npm package name.
   * This package exports a single synchronous function that takes a string as input and returns an object {
   *   validForNewPackages: boolean;
   *   validForOldPackages: boolean;
   *   errors?: string[];
   * }
   * @param name
   */
  function validate(name: unknown): validate.PackageNameValidationResult;

  export = validate;
}
