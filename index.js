const path = require('path');
const _ = require('lodash');
const yaml = require('js-yaml');
const fs = require('fs');

class Plugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    if (Number(serverless.version.charAt(0)) >= 3) {
      this.hooks = {
        'before:package:createDeploymentArtifacts': this.createDeploymentArtifacts.bind(this),
      };
    } else {
      this.hooks = {
        'before:deploy:createDeploymentArtifacts': this.createDeploymentArtifacts.bind(this),
      };
    }
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
    if ((disabled === undefined && enabled === undefined) || (disabled != undefined && !disabled) || (enabled != undefined && enabled.includes(this.options.stage))) {
      const distributionConfig = resources.Resources.WebsiteDistribution.Properties.DistributionConfig;
      const redirectDistributionConfig = resources.Resources.RedirectDistribution.Properties.DistributionConfig;
      const bucketPolicy = resources.Resources.WebsiteBucketBucketPolicy;

      this.prepareOriginAccessIdentity(resources.Resources);

      this.prepareApi(distributionConfig);

      this.prepareFailover(distributionConfig, bucketPolicy);

      this.prepareComment(distributionConfig, redirectDistributionConfig);
      this.preparePriceClass(distributionConfig, redirectDistributionConfig);

      this.prepareLogging(distributionConfig, redirectDistributionConfig);
      this.prepareCertificate(distributionConfig, redirectDistributionConfig);
      this.prepareWaf(distributionConfig, redirectDistributionConfig);

      this.prepareAliases(distributionConfig, redirectDistributionConfig);
      this.prepareWebsiteEndpointRecord(resources);
    } else {
      delete resources.Resources.WebsiteBucketBucketPolicy;
      delete resources.Resources.WebsiteBucketOriginAccessIdentity;
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

  prepareOriginAccessIdentity(resources) {
    const name = this.serverless.getProvider('aws').naming.getApiGatewayName();
    resources.WebsiteBucketOriginAccessIdentity.Properties.CloudFrontOriginAccessIdentityConfig.Comment = `Website: ${name} (${this.options.region})`;
  }

  prepareApi(distributionConfig) {
    const api = this.serverless.service.custom.cdn.api;

    if (api) {
      distributionConfig.Origins[2].DomainName = api.domainName;
      distributionConfig.Origins[2].OriginPath = api.originPath;
      distributionConfig.CacheBehaviors[0].PathPattern = api.pathPattern || '/api-*';
      distributionConfig.CacheBehaviors[0].ForwardedValues.Headers = api.headers || ['Accept', 'Authorization', 'Referer', 'Content-Type'];
    } else {
      distributionConfig.Origins = [
        distributionConfig.Origins[0],
        distributionConfig.Origins[1],
      ];
      delete distributionConfig.CacheBehaviors;
    }
  }

  prepareFailover(distributionConfig, bucketPolicy) {
    const failover = this.serverless.service.custom.cdn.failover;
    const partition = this.serverless.service.custom.partition || 'aws';

    if (failover && failover[this.options.region]) {
      distributionConfig.Origins[1].DomainName = failover[this.options.region].bucketDomainName;

      const originAccessIdentityId = _.castArray(failover[this.options.region].originAccessIdentityId || []);
      const ids = originAccessIdentityId
        .filter((id) => id != 'UNDEFINED')
        .map((id) => `arn:${partition}:iam::cloudfront:user/CloudFront Origin Access Identity ${id}`);

      bucketPolicy.Properties.PolicyDocument.Statement[0].Principal.AWS.push(ids);
      bucketPolicy.Properties.PolicyDocument.Statement[1].Principal.AWS.push(ids);

      if (failover.criteria) {
        distributionConfig.OriginGroups.Items[0].FailoverCriteria.StatusCodes.Items = failover.criteria;
      }
    } else {
      if (distributionConfig.Origins.length === 3) {
        distributionConfig.Origins = [
          distributionConfig.Origins[0],
          distributionConfig.Origins[2],
        ];
      } else {
        distributionConfig.Origins = [
          distributionConfig.Origins[0],
        ];
      }
      delete distributionConfig.OriginGroups;
      distributionConfig.DefaultCacheBehavior.TargetOriginId = distributionConfig.Origins[0].Id;
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

      const minimumProtocolVersion = this.serverless.service.custom.cdn.minimumProtocolVersion;
      if (minimumProtocolVersion) {
        distributionConfig.ViewerCertificate.MinimumProtocolVersion = minimumProtocolVersion;
        redirectDistributionConfig.ViewerCertificate.MinimumProtocolVersion = minimumProtocolVersion;
      }

      distributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy = 'redirect-to-https';
      redirectDistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy = 'redirect-to-https';
    } else {
      delete distributionConfig.ViewerCertificate;
      delete redirectDistributionConfig.ViewerCertificate;
    }
  }

  prepareWaf(distributionConfig, redirectDistributionConfig) {
    const webACLId = this.serverless.service.custom.cdn.webACLId;

    if (webACLId) {
      distributionConfig.WebACLId = webACLId;
      redirectDistributionConfig.WebACLId = webACLId;
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
