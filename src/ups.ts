import axios from 'axios';
import {
	TRetrieveRateProps,
	TShipmentProps,
	TRate,
	IUPSClientProps,
	TShipperAddress,
	IValidateAddressProps,
	TShippingAddress,
	TEstimateDeliveryDateResponse,
} from './ups.types';

class UPSApi {
	baseUrl: string;
	client_id: string;
	client_secret: string;
	token: {
        token_type: string | null;
        access_token: string | null;
        expires_at: number;
    };

	constructor({ client_id, client_secret, isSandbox = false }: IUPSClientProps) {
		this.baseUrl = isSandbox ? 'https://wwwcie.ups.com' : 'https://onlinetools.ups.com';
		this.client_id = client_id;
		this.client_secret = client_secret;
		this.token = {
			token_type: null,
			access_token: null,
			expires_at: 0,
		};
	}

	async authenticate() {
		const buffer = Buffer.from(`${this.client_id}:${this.client_secret}`);
		const base64Auth = buffer.toString('base64');
		const payload = new URLSearchParams({
			grant_type: 'client_credentials',
		});
		try {
			const {
				data: { token_type, issued_at, access_token, expires_in },
			} = await axios.post(`${this.baseUrl}/security/v1/oauth/token`, payload.toString(), {
				headers: {
					authorization: `Basic ${base64Auth}`,
					'x-merchant-id': this.client_id,
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
				},
			});
			this.token = {
				token_type,
				access_token,
				expires_at: +issued_at + +expires_in * 1000,
			};
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	async estimateDeliveryDate(
		shipper_address: TShipperAddress,
		shipping_address: TShippingAddress,
		cartId: string,
		weight?: number
	): Promise<TEstimateDeliveryDateResponse> {
		try {
			const isTokenAvailable = this.token.access_token && Date.now() + 500 < this.token.expires_at;
			if (!isTokenAvailable) {
				await this.authenticate();
			}

			const today = new Date();
			const shipDate = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
			const skuWeight = weight && {
				weight: Math.round(weight / 25.4),
				weightUnitOfMeasure: 'LBS',
			};

			const payload = {
				originCountryCode: shipper_address.country_code,
				originStateProvince: shipper_address.state_province,
				originCityName: shipper_address.city,
				originPostalCode: shipper_address.zip,
				destinationCountryCode: shipping_address.country_code,
				destinationStateProvince: shipping_address.province,
				destinationCityName: shipping_address.city,
				destinationPostalCode: shipping_address.postal_code,
				skuWeight,
				// billType: "03",
				shipDate,
				// shipTime: "",
				residentialIndicator: '',
				avvFlag: true,
				// numberOfPackages: 1,
			};

			const { data } = await axios.post(`${this.baseUrl}/api/shipments/v1/transittimes`, payload, {
				headers: {
					authorization: `Bearer ${this.token.access_token}`,
					transId: cartId,
					transactionSrc: 'uc-ecommerce',
					'Content-Type': 'application/json',
				},
			});

			return data;
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	async retrieveRate(
		shipment: TRetrieveRateProps & { cartId: string },
		shipper_address: TShipperAddress,
		account_number: string,
		customer_name: string
	): Promise<number> {
		try {
			const isTokenAvailable = this.token.access_token && Date.now() + 500 < this.token.expires_at;
			if (!isTokenAvailable) {
				await this.authenticate();
			}

			const packages = shipment.dimensionsWithSKU.map((packageItem) => ({
				PackagingType: {
					Code: '02',
				},
				Dimensions: {
					UnitOfMeasurement: {
						Code: 'IN',
						Description: 'Inches',
					},
					Length: `${Math.round(+packageItem.length / 25.4)}`,
					Width: `${Math.round(+packageItem.width / 25.4)}`,
					Height: `${Math.round(+packageItem.height / 25.4)}`,
				},
				PackageWeight: {
					UnitOfMeasurement: {
						Code: 'LBS',
						Description: 'Pounds',
					},
					Weight: `${Number.parseFloat(`${packageItem.weight / 453.6}`).toFixed(2)}`,
				},
				PackageServiceOptions: {
					DeliveryConfirmation: {
						DCISType: '2',
					},
				},
			}));
			const payload = {
				RateRequest: {
					Request: {
						TransactionReference: {
							CustomerContext: customer_name,
							TransactionIdentifier: shipment.cartId,
						},
					},
					Shipment: {
						Shipper: {
							Name: shipper_address.shipper_name,
							ShipperNumber: account_number,
							Address: {
								AddressLine: shipper_address.address_line,
								City: shipper_address.city,
								StateProvinceCode: shipper_address.state_province,
								PostalCode: shipper_address.zip,
								CountryCode: shipper_address.country_code,
							},
						},
						ShipTo: {
							Name: `${shipment.first_name} ${shipment.last_name}`,
							Address: {
								AddressLine: [
									shipment.shippingAddress.address_1,
									shipment.shippingAddress.address_2 || '',
								],
								City: shipment.shippingAddress.city,
								StateProvinceCode: shipment.shippingAddress.province,
								PostalCode: shipment.shippingAddress.postal_code,
								CountryCode: shipment.shippingAddress.country_code,
							},
						},
						ShipFrom: {
							Name: shipper_address.shipper_name,
							Address: {
								AddressLine: shipper_address.address_line,
								City: shipper_address.city,
								StateProvinceCode: shipper_address.state_province,
								PostalCode: shipper_address.zip,
								CountryCode: shipper_address.country_code,
							},
						},
						PaymentDetails: {
							ShipmentCharge: {
								Type: '01',
								BillShipper: {
									AccountNumber: account_number,
								},
							},
						},
						Service: {
							Code: shipment.serviceCode,
						},
						Package: packages,
						ShipmentRatingOptions: {
							NegotiatedRatesIndicator: '1',
						},
					},
				},
			};

			const { data } = await axios.post(`${this.baseUrl}/api/rating/v1/Shop`, payload, {
				headers: {
					authorization: `Bearer ${this.token.access_token}`,
					'Content-Type': 'application/json',
				},
			});

			const targetRate = data?.RateResponse?.RatedShipment.find(
				(rate: TRate) => rate.Service.Code === shipment.serviceCode
			);

			return Math.round(targetRate.NegotiatedRateCharges.TotalCharge.MonetaryValue * 100) || 0;
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	async createShipment(
		shipment: TShipmentProps,
		shipper_address: TShipperAddress,
		account_number: string,
		package_description: string
	): Promise<any> {
		try {
			const isTokenAvailable = this.token.access_token && Date.now() + 500 < this.token.expires_at;
			if (!isTokenAvailable) {
				await this.authenticate();
			}

			const packages = shipment.dimensionsWithSKU.map((packageItem) => ({
				Packaging: {
					Code: '02',
				},
				Dimensions: {
					UnitOfMeasurement: {
						Code: 'IN',
						Description: 'Inches',
					},
					Length: `${Math.round(+packageItem.length / 25.4)}`,
					Width: `${Math.round(+packageItem.width / 25.4)}`,
					Height: `${Math.round(+packageItem.height / 25.4)}`,
				},
				PackageWeight: {
					UnitOfMeasurement: {
						Code: 'LBS',
						Description: 'Pounds',
					},
					Weight: `${Number.parseFloat(`${packageItem.weight / 453.6}`).toFixed(2)}`,
				},
				PackageServiceOptions: {
					DeliveryConfirmation: {
						DCISType: '2',
					},
				},
				ReferenceNumber: {
					Value: `#${shipment.displayId}`,
				},
			}));

			const payload = {
				ShipmentRequest: {
					Request: {
						RequestOption: 'city',
					},
					Shipment: {
						Description: package_description,
						Shipper: {
							Name: shipper_address.shipper_name,
							ShipperNumber: account_number,
							Address: {
								AddressLine: shipper_address.address_line,
								City: shipper_address.city,
								StateProvinceCode: shipper_address.state_province,
								PostalCode: shipper_address.zip,
								CountryCode: shipper_address.country_code,
							},
						},
						ShipTo: {
							Phone: {
								Number: shipment.phoneNumber,
							},
							Name: `${shipment.first_name} ${shipment.last_name}`,
							Address: {
								AddressLine: [
									shipment.shippingAddress.address_1,
									shipment.shippingAddress.address_2 || '',
								],
								City: shipment.shippingAddress.city,
								StateProvinceCode: shipment.shippingAddress.province,
								PostalCode: shipment.shippingAddress.postal_code,
								CountryCode: shipment.shippingAddress.country_code,
							},
							Residential: 'true',
						},
						ShipFrom: {
							Name: shipper_address.shipper_name,
							Address: {
								AddressLine: shipper_address.address_line,
								City: shipper_address.city,
								StateProvinceCode: shipper_address.state_province,
								PostalCode: shipper_address.zip,
								CountryCode: shipper_address.country_code,
							},
						},
						PaymentInformation: {
							ShipmentCharge: {
								Type: '01',
								BillShipper: {
									AccountNumber: account_number,
								},
							},
						},
						Service: {
							Code: shipment.serviceCode,
						},
						Package: packages,
						ShipmentRatingOptions: {
							NegotiatedRatesIndicator: '1',
						},
					},
					LabelSpecification: {
						LabelImageFormat: {
							Code: 'ZPL',
							Description: 'ZPL',
						},
						LabelStockSize: {
							Height: '6',
							Width: '4',
						},
						HTTPUserAgent: 'Mozilla/4.5',
					},
				},
			};
			const { data } = await axios.post(`${this.baseUrl}/api/shipments/v1801/ship`, payload, {
				headers: {
					authorization: `Bearer ${this.token.access_token}`,
					'Content-Type': 'application/json',
				},
				params: {
					additionaladdressvalidation: 'city',
				},
			});
			return data;
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	async createReturn(
		shipment: TShipmentProps,
		shipper_address: TShipperAddress,
		account_number: string
	): Promise<any> {
		try {
			const isTokenAvailable = this.token.access_token && Date.now() + 500 < this.token.expires_at;
			if (!isTokenAvailable) {
				await this.authenticate();
			}

			const packages = shipment.dimensionsWithSKU.map((packageItem) => ({
				PackagingType: {
					Code: '02',
				},
				Dimensions: {
					UnitOfMeasurement: {
						Code: 'IN',
						Description: 'Inches',
					},
					Length: `${Math.round(+packageItem.length / 25.4)}`,
					Width: `${Math.round(+packageItem.width / 25.4)}`,
					Height: `${Math.round(+packageItem.height / 25.4)}`,
				},
				PackageWeight: {
					UnitOfMeasurement: {
						Code: 'LBS',
						Description: 'Pounds',
					},
					Weight: `${Number.parseFloat(`${packageItem.weight / 453.6}`).toFixed(2)}`,
				},
			}));

			const payload = {
				ShipmentRequest: {
					Request: {
						RequestOption: 'city',
					},
					Shipment: {
						Description: 'Electric chargers',
						Shipper: {
							Name: shipper_address.shipper_name,
							ShipperNumber: account_number,
							Address: {
								AddressLine: ['1911 SW 31ST AVENUE', 'BAY 2'],
								City: 'HALLANDALE BEACH',
								StateProvinceCode: 'FL',
								PostalCode: '33009',
								CountryCode: 'US',
							},
						},
						ShipTo: {
							Phone: {
								Number: '631-721-8990',
							},
							Name: shipper_address.shipper_name,
							Address: {
								AddressLine: ['1911 SW 31ST AVENUE', 'BAY 2'],
								City: 'HALLANDALE BEACH',
								StateProvinceCode: 'FL',
								PostalCode: '33009',
								CountryCode: 'US',
							},
							Residential: 'false',
						},
						ShipFrom: {
							Name: `${shipment.first_name} ${shipment.last_name}`,
							Address: {
								AddressLine: [
									shipment.shippingAddress.address_1,
									shipment.shippingAddress.address_2 || '',
								],
								City: shipment.shippingAddress.city,
								StateProvinceCode: shipment.shippingAddress.province,
								PostalCode: shipment.shippingAddress.postal_code,
								CountryCode: shipment.shippingAddress.country_code,
							},
						},
						PaymentInformation: {
							ShipmentCharge: {
								Type: '01',
								BillShipper: {
									AccountNumber: account_number,
								},
							},
						},
						ReturnService: {
							Description: 'Electric chargers',
							Code: '9',
						},
						Service: {
							Code: shipment.serviceCode,
						},
						Package: packages,
						ShipmentRatingOptions: {
							NegotiatedRatesIndicator: '1',
						},
					},
					LabelSpecification: {
						LabelImageFormat: {
							Code: 'ZPL',
							Description: 'ZPL',
						},
						LabelStockSize: {
							Height: '6',
							Width: '4',
						},
						HTTPUserAgent: 'Mozilla/4.5',
					},
				},
			};
			const { data } = await axios.post(`${this.baseUrl}/api/shipments/v1801/ship`, payload, {
				headers: {
					authorization: `Bearer ${this.token.access_token}`,
					'Content-Type': 'application/json',
				},
				params: {
					additionaladdressvalidation: 'city',
				},
			});
			return data;
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	async validateAddress(address: IValidateAddressProps): Promise<any> {
		const isTokenAvailable = this.token.access_token && Date.now() + 500 < this.token.expires_at;
		if (!isTokenAvailable) {
			await this.authenticate();
		}

		const { address_line, country_code, city, province, zip, zip_extended = '' } = address;

		const { data } = await axios.post(
			`${this.baseUrl}/api/addressvalidation/v1/1`,
			{
				XAVRequest: {
					AddressKeyFormat: {
						AddressLine: address_line,
						PoliticalDivision2: city,
						PoliticalDivision1: province,
						PostcodePrimaryLow: `${zip}`,
						PostcodeExtendedLow: `${zip_extended}`,
						CountryCode: country_code,
					},
				},
			},
			{
				headers: {
					authorization: `Bearer ${this.token.access_token}`,
					'Content-Type': 'application/json',
				},
			}
		);

		return data;
	}

	async trackPackage(trackingNumber: string, transactionId: string): Promise<string> {
		const isTokenAvailable = this.token.access_token && Date.now() + 500 < this.token.expires_at;
		if (!isTokenAvailable) {
			await this.authenticate();
		}

		const { data } = await axios.get(`${this.baseUrl}/api/track/v1/details/${trackingNumber}`, {
			headers: {
				authorization: `Bearer ${this.token.access_token}`,
				'Content-Type': 'application/json',
				transactionSrc: 'uc-ecommerce',
				transId: transactionId,
			},
		});

		return data;
	}
}

export default UPSApi;
