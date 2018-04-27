// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
import * as assert from "assert";
import { HttpMethod } from "../../../lib/httpMethod";
import { HttpRequest } from "../../../lib/httpRequest";
import { HttpResponse } from "../../../lib/httpResponse";
import { InMemoryHttpResponse } from "../../../lib/inMemoryHttpResponse";
import { ExponentialRetryPolicy, exponentialRetryPolicy } from "../../../lib/policies/exponentialRetryPolicy";
import { RequestPolicy } from "../../../lib/requestPolicy";
import { RequestPolicyFactory } from "../../../lib/requestPolicyFactory";
import { RequestPolicyOptions } from "../../../lib/requestPolicyOptions";

describe("exponentialRetryPolicy", () => {
  describe("shouldRetry()", () => {
    const nextPolicy: RequestPolicy = {
      send: (request: HttpRequest) => {
        return Promise.resolve(new InMemoryHttpResponse(request, 200, {}));
      }
    };
    const policy = new ExponentialRetryPolicy({}, nextPolicy, new RequestPolicyOptions());
    const request = new HttpRequest({ method: "GET", url: "https://www.example.com" });

    it("should return when no response is given", () => {
      assert.strictEqual(policy.shouldRetry({}), true);
    });

    it("should not retry when response status code is 200", () => {
      assert.strictEqual(policy.shouldRetry({ response: new InMemoryHttpResponse(request, 200, {})}), false);
    });

    it("should not retry when response status code is 300", () => {
      assert.strictEqual(policy.shouldRetry({ response: new InMemoryHttpResponse(request, 300, {})}), false);
    });

    it("should retry when response status code is 408", () => {
      assert.strictEqual(policy.shouldRetry({ response: new InMemoryHttpResponse(request, 408, {})}), true);
    });

    it("should not retry when response status code is 500", () => {
      assert.strictEqual(policy.shouldRetry({ response: new InMemoryHttpResponse(request, 500, {})}), true);
    });

    it("should retry when response status code is 501", () => {
      assert.strictEqual(policy.shouldRetry({ response: new InMemoryHttpResponse(request, 501, {})}), false);
    });

    it("should retry when response status code is 505", () => {
      assert.strictEqual(policy.shouldRetry({ response: new InMemoryHttpResponse(request, 505, {})}), false);
    });
  });

  it("should do nothing if no error occurs", async () => {
    const policyFactory: RequestPolicyFactory = exponentialRetryPolicy({
      maximumAttempts: 3,
      initialRetryDelayInMilliseconds: 100,
      maximumRetryIntervalInMilliseconds: 1000
    });

    const nextPolicy: RequestPolicy = {
      send: (request: HttpRequest) => {
        request.headers.set("A", "B");
        return Promise.resolve(new InMemoryHttpResponse(request, 200, {}));
      }
    };

    const policy: RequestPolicy = policyFactory(nextPolicy, new RequestPolicyOptions());
    const request = new HttpRequest({ method: HttpMethod.GET, url: "https://spam.com" });
    const response: HttpResponse = await policy.send(request);

    assert.deepStrictEqual(request, new HttpRequest({ method: HttpMethod.GET, url: "https://spam.com" }), "The original request should not be modified.");
    assert.deepStrictEqual(response.request, new HttpRequest({ method: HttpMethod.GET, url: "https://spam.com", headers: { "A": "B" } }), "The request associated with the response should have the modified header.");
  });

  it("should retry if an undefined HttpResponse is returned", async () => {
    let millisecondsDelayed = 0;

    const policyFactory: RequestPolicyFactory = exponentialRetryPolicy({
      maximumAttempts: 3,
      initialRetryDelayInMilliseconds: 30 * 1000,
      maximumRetryIntervalInMilliseconds: 90 * 1000,
      delayFunction: (delayInMilliseconds: number) => {
        millisecondsDelayed += delayInMilliseconds;
        return Promise.resolve();
      }
    });

    let attempt = 0;

    const nextPolicy: RequestPolicy = {
      send: (request: HttpRequest) => {
        ++attempt;
        request.headers.set("A", attempt);
        return Promise.resolve(attempt === 1 ? <any>undefined : new InMemoryHttpResponse(request, 200, {}));
      }
    };

    const policy: RequestPolicy = policyFactory(nextPolicy, new RequestPolicyOptions());
    const request = new HttpRequest({ method: HttpMethod.GET, url: "https://spam.com" });
    const response: HttpResponse = await policy.send(request);

    assert.deepStrictEqual(request, new HttpRequest({ method: HttpMethod.GET, url: "https://spam.com" }), "The original request should not be modified.");
    assert.deepStrictEqual(response.request, new HttpRequest({ method: HttpMethod.GET, url: "https://spam.com", headers: { "A": "2" } }), "The request associated with the response should have the modified header.");
    assert.strictEqual(millisecondsDelayed, 30 * 1000);
  });
});
