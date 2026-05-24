// Path: C:\smart-store\apps\chrome-extension\src\domain\product-id.ts
export class ProductId {
  private constructor(private readonly value: string) {}

  public static create(input: string | number): ProductId {
    const normalized = String(input).trim();

    if (!/^\d+$/.test(normalized)) {
      throw new Error(`Invalid product id: ${input}`);
    }

    return new ProductId(normalized);
  }

  public toString(): string {
    return this.value;
  }

  public equals(other: ProductId): boolean {
    return this.value === other.value;
  }
}
