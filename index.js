const path = require('path');
const _ = require('lodash');
const yaml = require('js-yaml');
const fs = require('fs');

class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.hooks = {
      'before:deploy:createDeploymentArtifacts': this.createDeploymentArtifacts.bind(this),
    };
  }

  createDeploymentArtifacts() {
    const baseResources = this.serverless.service.provider.compiledCloudFormationTemplate;

    const filename = path.resolve(__dirname, 'resources.yml'); // eslint-disable-line
    const content = fs.readFileSync(filename, 'utf-8');
    const resources = yaml.safeLoad(content, {
      filename: filename
    });

    this.prepareResources(resources);
    return _.merge(baseResources, resources);
  }

  prepareResources(resources) {
    if (!this.serverless.service.custom.cdn) {
      this.serverless.service.custom.cdn = {};
    }

    if (!this.serverless.service.custom.dns) {
      this.serverless.service.custom.dns = {};
    }

    // everything except buckets
    const disabled = this.serverless.service.custom.cdn.disabled;
    const enabled = this.serverless.service.custom.cdn.enabled;
    if ((disabled != undefined && !disabled) || (enabled && enabled.includes(this.options.stage))) {
      const distributionConfig = resources.Resources.WebsiteDistribution.Properties.DistributionConfig;
      const redirectDistributionConfig = resources.Resources.RedirectDistribution.Properties.DistributionConfig;

      this.prepareComment(distributionConfig, redirectDistributionConfig);
      this.preparePriceClass(distributionConfig, redirectDistributionConfig);

      this.prepareLogging(distributionConfig, redirectDistributionConfig);
      this.prepareCertificate(distributionConfig, redirectDistributionConfig);
      this.prepareWaf(distributionConfig, redirectDistributionConfig);

      this.prepareAliases(distributionConfig, redirectDistributionConfig);
      this.prepareWebsiteEndpointRecord(resources);
    } else {
      delete resources.Resources.WebsiteDistribution;
      delete resources.Resources.WebsiteEndpointRecord;
      delete resources.Resources.RedirectDistribution;
      delete resources.Resources.RedirectEndpointRecord;
      delete resources.Outputs.WebsiteDistributionId;
      delete resources.Outputs.WebsiteDistributionURL;
      delete resources.Outputs.WebsiteURL;
    }

    // disable root domain redirect
    const redirect = this.serverless.service.custom.spa.redirect || false;
    if (redirect) {
      this.prepareRedirectBucket(resources);
    } else {
      delete resources.Resources.RedirectBucket;
      delete resources.Resources.RedirectDistribution;
      delete resources.Resources.RedirectEndpointRecord;
    }
  }

  prepareComment(distributionConfig, redirectDistributionConfig) {
    const name = this.serverless.getProvider('aws').naming.getApiGatewayName();
    distributionConfig.Comment = `Website: ${name} (${this.options.region})`;
    redirectDistributionConfig.Comment = `Redirect: ${name} (${this.options.region})`;
  }

  preparePriceClass(distributionConfig, redirectDistributionConfig) {
    const priceClass = this.serverless.service.custom.cdn.priceClass;

    if (priceClass) {
      distributionConfig.PriceClass = priceClass;
      redirectDistributionConfig.PriceClass = priceClass;
    } else {
      // default to US and Europe
      distributionConfig.PriceClass = 'PriceClass_100';
      redirectDistributionConfig.PriceClass = 'PriceClass_100';
    }
  }

  prepareLogging(distributionConfig, redirectDistributionConfig) {
    const logging = this.serverless.service.custom.cdn.logging;

    if (logging) {
      distributionConfig.Logging.Bucket = `${logging.bucketName}.s3.amazonaws.com`;
      distributionConfig.Logging.Prefix = logging.prefix || 'aws-cloudfront';

      redirectDistributionConfig.Logging.Bucket = `${logging.bucketName}.s3.amazonaws.com`;
      redirectDistributionConfig.Logging.Prefix = logging.prefix || 'aws-cloudfront';

    } else {
      delete distributionConfig.Logging;
      delete redirectDistributionConfig.Logging;
    }
  }

  prepareCertificate(distributionConfig, redirectDistributionConfig) {
    const acmCertificateArn = this.serverless.service.custom.cdn.acmCertificateArn;
    if (acmCertificateArn) {
      distributionConfig.ViewerCertificate.AcmCertificateArn = acmCertificateArn;
      redirectDistributionConfig.ViewerCertificate.AcmCertificateArn = acmCertificateArn;
    } else {
      delete distributionConfig.ViewerCertificate;
      delete redirectDistributionConfig.ViewerCertificate;
    }
  }

  prepareWaf(distributionConfig, redirectDistributionConfig) {
    const WebACLId = this.serverless.service.custom.cdn.WebACLId;

    if (WebACLId) {
      distributionConfig.WebACLId = WebACLId;
      redirectDistributionConfig.WebACLId = WebACLId;
    } else {
      delete distributionConfig.WebACLId;
      delete redirectDistributionConfig.WebACLId;
    }
  }

  prepareAliases(distributionConfig, redirectDistributionConfig) {
    const hostedZoneId = this.serverless.service.custom.dns.hostedZoneId;
    const aliases = this.serverless.service.custom.cdn.aliases;
    if (aliases) {
      distributionConfig.Aliases = aliases;
    } else {
      const endpoint = this.serverless.service.custom.dns.endpoint;
      if (hostedZoneId && endpoint) {
        distributionConfig.Aliases = [endpoint];
      } else {
        delete distributionConfig.Aliases;
      }
    }

    const domainName = this.serverless.service.custom.dns.domainName;
    if (hostedZoneId && domainName) {
      redirectDistributionConfig.Aliases = [domainName];
    } else {
      delete redirectDistributionConfig.Aliases;
    }
  }

  prepareWebsiteEndpointRecord(resources) {
    const hostedZoneId = this.serverless.service.custom.dns.hostedZoneId;
    if (hostedZoneId) {
      const properties = resources.Resources.WebsiteEndpointRecord.Properties;
      const redirectProperties = resources.Resources.RedirectEndpointRecord.Properties;

      properties.HostedZoneId = hostedZoneId;
      redirectProperties.HostedZoneId = hostedZoneId;

      const endpoint = this.serverless.service.custom.dns.endpoint;
      if (endpoint) {
        properties.Name = `${endpoint}.`;

        const protocol = this.serverless.service.custom.cdn.acmCertificateArn ? 'https' : 'http';
        resources.Outputs.WebsiteURL.Value = `${protocol}://${endpoint}`;
      } else {
        delete resources.Resources.WebsiteEndpointRecord;
        delete resources.Outputs.WebsiteURL;
      }

      const domainName = this.serverless.service.custom.dns.domainName;
      if (domainName) {
        redirectProperties.Name = `${domainName}.`;
      } else {
        delete resources.Resources.RedirectEndpointRecord;
      }

    } else {
      delete resources.Resources.WebsiteEndpointRecord;
      delete resources.Resources.RedirectEndpointRecord;
      delete resources.Outputs.WebsiteURL;
    }
  }

  prepareRedirectBucket(resources) {
    const properties = resources.Resources.RedirectBucket.Properties;

    const domainName = this.serverless.service.custom.dns.domainName;
    if (domainName) {
      properties.BucketName = domainName;
    }

    const endpoint = this.serverless.service.custom.dns.endpoint;
    if (endpoint) {
      properties.WebsiteConfiguration.RedirectAllRequestsTo.HostName = endpoint;
    }
  }
}

module.exports = Plugin;
