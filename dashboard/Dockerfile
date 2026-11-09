# The build context is the dashboard/ folder.
ARG DOTNET_MAJOR=10

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_MAJOR}.0 AS build
ARG DOTNET_MAJOR
WORKDIR /src
COPY Directory.Build.props ./
COPY src/LumenX.Dashboard/LumenX.Dashboard.csproj src/LumenX.Dashboard/
RUN dotnet restore src/LumenX.Dashboard/LumenX.Dashboard.csproj -p:PackagesMajor=${DOTNET_MAJOR}
COPY src/LumenX.Dashboard/ src/LumenX.Dashboard/
RUN dotnet publish src/LumenX.Dashboard/LumenX.Dashboard.csproj -c Release -o /app/publish -p:PackagesMajor=${DOTNET_MAJOR}

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_MAJOR}.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "LumenX.Dashboard.dll"]
