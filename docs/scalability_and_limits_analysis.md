# Scalability and Resource Limits Analysis

This document calculates how many Customer Care Centers (CCCs) can use your application under the **Vercel Hobby Plan** and **Google Sheets API** free tier, using the actual transaction numbers retrieved from your database.

---

## 1. Actual Database Transaction Volume (Per CCC)

From our analysis of your current Google Sheet database, here is the record volume for one active CCC:
* **Static Master Data**: `Consumer_Master` has **49,231 records** (the 45k search database).
* **High-Frequency Writing Sheets**:
  * `Sheet1` (Active Disconnections): **1,745 records**
  * `DC_History` (Disconnection History): **1,286 records**
  * `DD` (Deemed Visits): **502 records**
* **Low-to-Medium Frequency Sheets**:
  * `NSC_Applications`: **52 records**
  * `DTR` (Transformer List): **898 records**
  * `Reconnection`: **94 records**
  * `Meter_Stock` / `Replacement` / `Material`: **< 50 records**

### Estimated Activity Profile Per CCC:
* **Active Users**: ~10 users (2 Admins, 8 Field Agency workers).
* **Daily Writes**: ~100 writes/status updates total.
* **Daily Reads / Syncs**: ~400 reads (pages loaded, manual refreshes, background updates).
* **Average Daily API Requests**: **500 requests per day per CCC**.
* **Average Monthly API Requests**: **15,000 requests per month per CCC**.

---

## 2. Google Sheets API Limit Constraints

Google Sheets API has the following global limits per project:
* **Read requests**: 300 per minute per project.
* **Write requests**: 300 per minute per project.
* **Per-user limit**: 60 requests per minute per user.

### CCC Capacity Calculation:
* With an average of 500 requests spread over an 8-hour workday, 1 CCC averages only **~1 request per minute**. 
* However, during peak hours (e.g., 9:00 AM when workers start their shift), 10 workers might perform 30 requests in a single minute.
* **Peak Load Estimate**: ~30 requests per minute per CCC.
* **Max CCCs supported before hitting 300 requests/minute**:
  $$\frac{300 \text{ req/min limit}}{30 \text{ peak req/min/CCC}} = 10 \text{ CCCs}$$

> [!TIP]
> **How to bypass this bottleneck**:
> By introducing a **5-second Server-Side Cache** on Next.js read endpoints (e.g. caching the `Consumer_Master` or `Disconnection` list on the Vercel server for 5 seconds), 10 agency users syncing at the same time will only count as **1 single request** to the Google Sheets API. With this optimization, you can easily scale to **50+ CCCs** on the same Google Sheets API project.

---

## 3. Vercel Hobby Plan Constraints

Vercel's Hobby (Free) plan has several limits:

### A. Serverless Function Executions (100,000 per day)
* **Limit**: 100k requests/day.
* **Calculation**:
  $$\frac{100,000 \text{ executions/day}}{500 \text{ requests/day/CCC}} = 200 \text{ CCCs}$$
* **Verdict**: Not a bottleneck.

### B. Serverless CPU Execution Time (100 GB-hours per month)
* **Limit**: Approximately 360,000 seconds of execution time per month.
* **Context**: Next.js serverless functions wait for the Google Sheets API to respond. A typical Google Sheets API call takes **~1.5 seconds**.
* **Calculation**:
  * 1 CCC = 15,000 requests/month $\times$ 1.5s = 22,500 execution seconds/month.
  * Max CCCs:
    $$\frac{360,000 \text{ total seconds}}{22,500 \text{ seconds/CCC}} = 16 \text{ CCCs}$$
* **Verdict**: This is a key soft-limit bottleneck. Caching read requests to return data instantly (<0.1s) will reduce average execution time and increase capacity.

### C. Serverless Function Timeout (10 seconds)
* **Limit**: Any single API request that takes longer than 10 seconds will fail (Vercel Hobby throws a `504 Gateway Timeout`).
* **Context**: Fetching a massive `Consumer_Master` sheet (49k rows) directly from Google Sheets can sometimes take 4 to 8 seconds under load. If multiple tables are joined, it can exceed 10 seconds.
* **Verdict**: To avoid timeouts as sheets grow, we should use **pagination** (loading 100 rows at a time) rather than downloading the entire sheet on every sync.

### D. Bandwidth (100 GB per month)
* **Limit**: 100 GB.
* **Context**: 49k consumer rows is ~4.5 MB in size.
* **Calculation**:
  * If 10 users in a CCC download this database twice a day:
    $$10 \text{ users} \times 2 \text{ syncs} \times 4.5 \text{ MB} \times 30 \text{ days} = 2.7 \text{ GB/month/CCC}$$
  * Max CCCs:
    $$\frac{100 \text{ GB limit}}{2.7 \text{ GB/CCC}} \approx 37 \text{ CCCs}$$
* **Verdict**: Easily managed, especially since the app uses IndexedDB caching to ensure users only download the data once, rather than on every page refresh.

---

## 4. Final Verdict & Recommendations

| Limit Category | Max CCCs (Unoptimized) | Max CCCs (With Optimizations) |
| :--- | :---: | :---: |
| **Google Sheets API (300 req/min)** | 10 | **50+** |
| **Vercel CPU Execution Time** | 16 | **40+** |
| **Vercel Bandwidth (100 GB/mo)** | 37 | **80+** |
| **Vercel Serverless Timeout (10s)** | Risk of failure as sheets grow | **Safe** |

### Safely Supported CCCs on Vercel Hobby:
* **Without changes**: **10 to 12 CCCs** is the safe maximum before you risk hitting Google Sheet rate limits or Vercel CPU limits during peak hours.
* **With simple optimizations**: **30 to 40 CCCs** can run smoothly on the single domain under the free Vercel Hobby plan.

### Recommended Scalability Optimizations:
1. **Server-Side Cache**: Cache reads for 5–10 seconds. This stops concurrent user requests from multiplying API traffic.
2. **Compress Images**: Ensure the app compresses photos in the browser (e.g., to <300 KB) before uploading to Google Drive to keep bandwidth low.
3. **Paginated Loading**: Load disconnections and consumer lists in pages (e.g., 100 at a time) rather than reading full sheets.
