export type TUPSClient = {
  baseUrl: string;
  client_id: string;
  client_secret: string;
  token: {
    token_type: string | null;
    access_token: string | null;
    expires_at: number;
  };
  account_number: string;
  customer_name: string;
  shipper_address: TShipperAddress;
  package_description: string;

  authenticate: () => void
  retrieveRate: (shipment: TRetrieveRateProps & { cartId: string }) => Promise<number>;
  createShipment: (shipment: TShipmentProps) => Promise<any>;
  createReturn: (shipment: TShipmentProps) => Promise<any>;
}

export type TParcelDimensions = {
  // in grams
  weight: number;
  // in mm
  width: number;
  // in mm
  height: number;
  // in mm
  length: number;
  // item identifier to place in on label
  SKU: string;
}

export interface TShippingAddress {
  address_1: string;
  address_2?: string;
  city: string;
  country_code: string;
  province: string;
  postal_code: string;
}

export type TRetrieveRateProps = {
  dimensionsWithSKU: TParcelDimensions[];
  shippingAddress: TShippingAddress;
  first_name: string;
  last_name: string;
  serviceCode: string;
}

export type TShipmentProps = TRetrieveRateProps & {
  orderId: string;
  phoneNumber: string;
}

export type TRate = {
  Service: {
    Code: string
  }
}

export type TShipperAddress = {
  shipper_name: string;
  address_line: string[];
  city: string;
  state_province: string;
  zip: string;
  country_code: string;
}

export interface IUPSClientProps {
  account_number: string;
  client_id: string;
  client_secret: string;
  customer_name: string;
  shipper_address: TShipperAddress;
  package_description: string;
  isSandbox?: boolean;
}

export interface IValidateAddressProps {
  address_line: string[],
  country_code: string;
  zip: string | number;
  zip_extended?: string | number;
  city: string;
  province: string;
}