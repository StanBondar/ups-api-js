export type TCreateShipmentResponse = {
  ShipmentResponse: {
    ShipmentResults: {
      PackageResults: {
        TrackingNumber: string;
        ShippingLabel: {
          ImageFormat: {
            Code: string;
          }
          GraphicImage: string;
        }
      }[]
    }
  },
  Response: {
    ResponseStatus: {
      Code: string;
      Description: string;
    }
  }
}

export type TUPSClient = {
  baseUrl: string;
  client_id: string;
  client_secret: string;
  token: {
    token_type: string | null;
    access_token: string | null;
    expires_at: number;
  };
  authenticate: () => void
  retrieveRate: (shipment: TRetrieveRateProps & { cartId: string },
    shipper_address: TShipperAddress,
    account_number: string,
    customer_name: string) => Promise<number>;
  createShipment: (shipment: TShipmentProps,
    shipper_address: TShipperAddress,
    account_number: string,
    package_description: string) => Promise<TCreateShipmentResponse>;
  createReturn: (shipment: TShipmentProps,
    shipper_address: TShipperAddress,
    account_number: string) => Promise<any>;
  trackPackage: (trackingNumber: string, transactionId: string) => Promise<string>
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
  client_id: string;
  client_secret: string;
  account_number?: string;
  customer_name?: string;
  package_description?: string;
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