import axios from 'axios';
import { TRetrieveRateProps, TShipmentProps, TRate, IUPSClientProps, TShipperAddress, IValidateAddressProps } from './ups.types';
import { config } from 'dotenv';
config();

class UPSApi {
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

	constructor({ client_id, client_secret, isSandbox = false, account_number, customer_name, package_description, shipper_address }: IUPSClientProps) {
		this.baseUrl = isSandbox ? 'https://wwwcie.ups.com' : 'https://onlinetools.ups.com';
		this.client_id = client_id;
		this.client_secret = client_secret;
		this.token = {
			token_type: null,
			access_token: null,
			expires_at: 0
		};
		this.account_number = account_number;
		this.customer_name = customer_name;
		this.shipper_address = shipper_address;
		this.package_description = package_description;
	}

	async authenticate() {
		const buffer = Buffer.from(`${this.client_id}:${this.client_secret}`);
		const base64Auth = buffer.toString('base64');
		const payload = new URLSearchParams({
			'grant_type': 'client_credentials'
		});
		try {
			const { data: { token_type, issued_at, access_token, expires_in } } = await axios.post(`${this.baseUrl}/security/v1/oauth/token`, payload.toString(), {
				headers: {
					authorization: `Basic ${base64Auth}`,
					'x-merchant-id': this.client_id,
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
				}
			});
			this.token = {
				token_type,
				access_token,
				expires_at: +issued_at + +expires_in * 1000
			};
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	async retrieveRate(shipment: TRetrieveRateProps & { cartId: string }): Promise<number> {
		try {
			const isTokenAvailable = this.token.access_token && (Date.now() + 500 < this.token.expires_at);
			if (!isTokenAvailable) {
				await this.authenticate();
			}

			const packages = shipment.dimensionsWithSKU.map(packageItem => ({
				'PackagingType': {
					'Code': '02',
				},
				'Dimensions': {
					'UnitOfMeasurement': {
						'Code': 'IN',
						'Description': 'Inches'
					},
					'Length': `${Math.round(+packageItem.length / 25.4)}`,
					'Width': `${Math.round(+packageItem.width / 25.4)}`,
					'Height': `${Math.round(+packageItem.height / 25.4)}`
				},
				'PackageWeight': {
					'UnitOfMeasurement': {
						'Code': 'LBS',
						'Description': 'Pounds'
					},
					'Weight': `${Number.parseFloat(`${packageItem.weight / 453.6}`).toFixed(2)}`
				},
				'PackageServiceOptions': {
					'DeliveryConfirmation': {
						'DCISType': '2'
					}
				}
			}));
			const payload = {
				'RateRequest': {
					'Request': {
						'TransactionReference': {
							'CustomerContext': this.customer_name,
							'TransactionIdentifier': shipment.cartId
						}
					},
					'Shipment': {
						'Shipper': {
							'Name': this.shipper_address.shipper_name,
							'ShipperNumber': this.account_number,
							'Address': {
								'AddressLine': this.shipper_address.address_line,
								'City': this.shipper_address.city,
								'StateProvinceCode': this.shipper_address.state_province,
								'PostalCode': this.shipper_address.zip,
								'CountryCode': this.shipper_address.country_code
							}
						},
						'ShipTo': {
							'Name': `${shipment.first_name} ${shipment.last_name}`,
							'Address': {
								'AddressLine': [
									shipment.shippingAddress.address_1,
									shipment.shippingAddress.address_2 || ''
								],
								'City': shipment.shippingAddress.city,
								'StateProvinceCode': shipment.shippingAddress.province,
								'PostalCode': shipment.shippingAddress.postal_code,
								'CountryCode': shipment.shippingAddress.country_code
							}
						},
						'ShipFrom': {
							'Name': this.shipper_address.shipper_name,
							'Address': {
								'AddressLine': this.shipper_address.address_line,
								'City': this.shipper_address.city,
								'StateProvinceCode': this.shipper_address.state_province,
								'PostalCode': this.shipper_address.zip,
								'CountryCode': this.shipper_address.country_code
							}
						},
						'PaymentDetails': {
							'ShipmentCharge': {
								'Type': '01',
								'BillShipper': {
									'AccountNumber': this.account_number,
								}
							}
						},
						'Service': {
							'Code': shipment.serviceCode,
						},
						'Package': packages,
						'ShipmentRatingOptions': {
							'NegotiatedRatesIndicator': '1'
						}
					}
				}
			};

			const { data } = await axios.post(`${this.baseUrl}/api/rating/v1/Shop`, payload, {
				headers: {
					authorization: `Bearer ${this.token.access_token}`,
					'Content-Type': 'application/json'
				}
			});

			const targetRate = data?.RateResponse?.RatedShipment.find((rate: TRate) => rate.Service.Code === shipment.serviceCode);

			return Math.round(targetRate.NegotiatedRateCharges.TotalCharge.MonetaryValue * 100) || 0;
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	async createShipment(shipment: TShipmentProps): Promise<any> {
		try {
			const isTokenAvailable = this.token.access_token && (Date.now() + 500 < this.token.expires_at);
			if (!isTokenAvailable) {
				await this.authenticate();
			}

			const packages = shipment.dimensionsWithSKU.map(packageItem => ({
				'Packaging': {
					'Code': '02',
				},
				'Dimensions': {
					'UnitOfMeasurement': {
						'Code': 'IN',
						'Description': 'Inches'
					},
					'Length': `${Math.round(+packageItem.length / 25.4)}`,
					'Width': `${Math.round(+packageItem.width / 25.4)}`,
					'Height': `${Math.round(+packageItem.height / 25.4)}`
				},
				'PackageWeight': {
					'UnitOfMeasurement': {
						'Code': 'LBS',
						'Description': 'Pounds'
					},
					'Weight': `${Number.parseFloat(`${packageItem.weight / 453.6}`).toFixed(2)}`
				},
				'PackageServiceOptions': {
					'DeliveryConfirmation': {
						'DCISType': '2'
					}
				},
				'ReferenceNumber': {
					'Value': packageItem.SKU
				}
			}));

			const payload = {
				'ShipmentRequest': {
					'Request': {
						'RequestOption': 'city'
					},
					'Shipment': {
						'Description': this.package_description,
						'Shipper': {
							'Name': this.shipper_address.shipper_name,
							'ShipperNumber': this.account_number,
							'Address': {
								'AddressLine': this.shipper_address.address_line,
								'City': this.shipper_address.city,
								'StateProvinceCode': this.shipper_address.state_province,
								'PostalCode': this.shipper_address.zip,
								'CountryCode': this.shipper_address.country_code
							}
						},
						'ShipTo': {
							'Phone': {
								'Number': shipment.phoneNumber
							},
							'Name': `${shipment.first_name} ${shipment.last_name}`,
							'Address': {
								'AddressLine': [
									shipment.shippingAddress.address_1,
									shipment.shippingAddress.address_2 || ''
								],
								'City': shipment.shippingAddress.city,
								'StateProvinceCode': shipment.shippingAddress.province,
								'PostalCode': shipment.shippingAddress.postal_code,
								'CountryCode': shipment.shippingAddress.country_code
							},
							'Residential': 'true'
						},
						'ShipFrom': {
							'Name': this.shipper_address.shipper_name,
							'Address': {
								'AddressLine': this.shipper_address.address_line,
								'City': this.shipper_address.city,
								'StateProvinceCode': this.shipper_address.state_province,
								'PostalCode': this.shipper_address.zip,
								'CountryCode': this.shipper_address.country_code
							}
						},
						'PaymentInformation': {
							'ShipmentCharge': {
								'Type': '01',
								'BillShipper': {
									'AccountNumber': this.account_number
								}
							}
						},
						'Service': {
							'Code': shipment.serviceCode,
						},
						'Package': packages,
						'ShipmentRatingOptions': {
							'NegotiatedRatesIndicator': '1'
						}
					},
					'LabelSpecification': {
						'LabelImageFormat': {
							'Code': 'ZPL',
							'Description': 'ZPL'
						},
						'LabelStockSize': {
							'Height': '6',
							'Width': '4'
						},
						'HTTPUserAgent': 'Mozilla/4.5'
					}
				}
			};
			const { data } = await axios.post(`${this.baseUrl}/api/shipments/v1801/ship`, payload, {
				headers: {
					authorization: `Bearer ${this.token.access_token}`,
					'Content-Type': 'application/json'
				},
				params: {
					additionaladdressvalidation: 'city'
				}
			});
			return data;
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	async createReturn(shipment: TShipmentProps): Promise<any> {
		try {
			const isTokenAvailable = this.token.access_token && (Date.now() + 500 < this.token.expires_at);
			if (!isTokenAvailable) {
				await this.authenticate();
			}

			const packages = shipment.dimensionsWithSKU.map(packageItem => ({
				'PackagingType': {
					'Code': '02',
				},
				'Dimensions': {
					'UnitOfMeasurement': {
						'Code': 'IN',
						'Description': 'Inches'
					},
					'Length': `${Math.round(+packageItem.length / 25.4)}`,
					'Width': `${Math.round(+packageItem.width / 25.4)}`,
					'Height': `${Math.round(+packageItem.height / 25.4)}`
				},
				'PackageWeight': {
					'UnitOfMeasurement': {
						'Code': 'LBS',
						'Description': 'Pounds'
					},
					'Weight': `${Number.parseFloat(`${packageItem.weight / 453.6}`).toFixed(2)}`
				}
			}));

			const payload = {
				'ShipmentRequest': {
					'Request': {
						'RequestOption': 'city'
					},
					'Shipment': {
						'Description': 'Electric chargers',
						'Shipper': {
							'Name': this.shipper_address.shipper_name,
							'ShipperNumber': this.account_number,
							'Address': {
								'AddressLine': [
									'1911 SW 31ST AVENUE',
									'BAY 2'
								],
								'City': 'HALLANDALE BEACH',
								'StateProvinceCode': 'FL',
								'PostalCode': '33009',
								'CountryCode': 'US'
							}
						},
						'ShipTo': {
							'Phone': {
								'Number': '631-721-8990'
							},
							'Name': this.shipper_address.shipper_name,
							'Address': {
								'AddressLine': [
									'1911 SW 31ST AVENUE',
									'BAY 2'
								],
								'City': 'HALLANDALE BEACH',
								'StateProvinceCode': 'FL',
								'PostalCode': '33009',
								'CountryCode': 'US'
							},
							'Residential': 'false'
						},
						'ShipFrom': {
							'Name': `${shipment.first_name} ${shipment.last_name}`,
							'Address': {
								'AddressLine': [
									shipment.shippingAddress.address_1,
									shipment.shippingAddress.address_2 || ''
								],
								'City': shipment.shippingAddress.city,
								'StateProvinceCode': shipment.shippingAddress.province,
								'PostalCode': shipment.shippingAddress.postal_code,
								'CountryCode': shipment.shippingAddress.country_code
							},
						},
						'PaymentInformation': {
							'ShipmentCharge': {
								'Type': '01',
								'BillShipper': {
									'AccountNumber': this.account_number
								}
							}
						},
						'ReturnService': {
							'Description': 'Electric chargers',
							'Code': '9'
						},
						'Service': {
							'Code': shipment.serviceCode,
						},
						'Package': packages,
						'ShipmentRatingOptions': {
							'NegotiatedRatesIndicator': '1'
						}
					},
					'LabelSpecification': {
						'LabelImageFormat': {
							'Code': 'ZPL',
							'Description': 'ZPL'
						},
						'LabelStockSize': {
							'Height': '6',
							'Width': '4'
						},
						'HTTPUserAgent': 'Mozilla/4.5'
					}
				}
			};
			const { data } = await axios.post(`${this.baseUrl}/api/shipments/v1801/ship`, payload, {
				headers: {
					authorization: `Bearer ${this.token.access_token}`,
					'Content-Type': 'application/json'
				},
				params: {
					additionaladdressvalidation: 'city'
				}
			});
			return data;
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	async validateAddress(address: IValidateAddressProps): Promise<any> {
		const isTokenAvailable = this.token.access_token && (Date.now() + 500 < this.token.expires_at);
		if (!isTokenAvailable) {
			await this.authenticate();
		}

		const { address_line, country_code, city, province, zip, zip_extended = '' } = address;

		const { data } = await axios.post(`${this.baseUrl}/api/addressvalidation/v1/1`, {
			'XAVRequest': {
				'AddressKeyFormat': {
					'AddressLine': address_line,
					'PoliticalDivision2': city,
					'PoliticalDivision1': province,
					'PostcodePrimaryLow': `${zip}`,
					'PostcodeExtendedLow': `${zip_extended}`,
					'CountryCode': country_code
				}
			}
		});

		return data;
	}
}

export default UPSApi;